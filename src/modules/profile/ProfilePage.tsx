import { BlocoLogo } from './BlocoLogo'
import { Check } from 'lucide-react'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { SaveButton } from '@/components/shared/SaveButton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDate } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { MyParticipation } from './MyParticipation'
import { StickySave } from '@/components/shared/StickySave'
import { MyData, MySensitiveData, type SaveBinder } from './MyData'
import { PAY_STATUS_CLASS, PAY_STATUS_LABEL, type StaffPayment } from '@/modules/finance/service'

const PIX_TYPES = [['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Chave aleatória']] as const

/** Chave PIX (professores e monitores hoje; liberável a outros papéis via permissão) e histórico de pagamentos próprios. */
function PixSection({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const allowed = usePermission('pix.manage', 'own')
  const [type, setType] = useState<(typeof PIX_TYPES)[number][0]>('cpf')
  const [value, setValue] = useState('')
  const current = useQuery({
    queryKey: ['my-pix', orgId, memberId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_pix_keys').select('key_type, key_value').eq('member_id', memberId).eq('is_default', true).is('archived_at', null).maybeSingle()
      if (error) throw error
      return data as { key_type: string; key_value: string } | null
    },
  })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_pix_key', { p_member: memberId, p_type: type, p_value: value })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Chave PIX salva.'); setValue(''); qc.invalidateQueries({ queryKey: ['my-pix', orgId, memberId] }) },
    onError: (e) => toast.error(/check|violat|23514/i.test(String(e) + JSON.stringify(e)) ? 'Chave PIX inválida para o tipo escolhido.' : friendlyError(e)),
  })
  if (!allowed) return null
  return (
    <Card className="space-y-2 p-4">
      <h3>Minha chave PIX</h3>
      {current.data ? <p>Atual: <span className="font-mono">{current.data.key_value}</span> <Badge>{PIX_TYPES.find((t) => t[0] === current.data!.key_type)?.[1]}</Badge></p>
        : <p className="text-muted-foreground">Nenhuma chave cadastrada.</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <Select aria-label="Tipo da chave" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {PIX_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <div className="flex gap-2 sm:col-span-2">
          <Input className="min-w-0 flex-1" aria-label="Chave" placeholder="Digite a nova chave" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !save.isPending) { e.preventDefault(); save.mutate() } }} />
          <Button type="button" size="icon" disabled={!value.trim() || save.isPending} aria-label="Salvar chave" title="Salvar chave" onClick={() => save.mutate()}><Check className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Só você e a direção veem a chave. Ao trocar, a anterior é arquivada e os pagamentos passados mantêm a chave usada na época.</p>
    </Card>
  )
}

/** Perfil do bloco (titular): e-mail, WhatsApp e redes sociais, a fonte dos contatos da Loja e do Site. */
function BlocoProfile({ memberId }: { memberId: string }) {
  const saver = useRef<(() => Promise<boolean | void>) | null>(null)
  const [saving, setSaving] = useState(false)
  const bind = useCallback<SaveBinder>((fn) => { saver.current = fn }, [])
  return (
    <div className="space-y-4">
      <h1>Perfil do bloco</h1>
      <BlocoLogo />
      <MyData memberId={memberId} bind={bind} part="bloco" />
      <StickySave><SaveButton type="button" className="w-full" disabled={saving} hint="Salvar perfil do bloco" onClick={async () => { setSaving(true); try { await saver.current?.() } catch { /* o bloco já avisa o erro */ } finally { setSaving(false) } }} /></StickySave>
    </div>
  )
}

export function ProfilePage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const memberId = membership?.member_id ?? ''
  const payments = useQuery({
    queryKey: ['my-payments', orgId, memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_payments')
        .select('id, competence, amount, status, due_on, paid_on, payment_method, distribution_destinations(name)')
        .eq('member_id', memberId).neq('status', 'cancelled').order('competence', { ascending: false }).limit(24)
      if (error) throw error
      return (data ?? []) as unknown as StaffPayment[]
    },
  })
  const head = useQuery({
    queryKey: ['me-head', orgId, memberId],
    enabled: Boolean(memberId),
    queryFn: async () => { const { data, error } = await supabase.from('members').select('full_name, display_name, joined_at').eq('id', memberId).single(); if (error) throw error; return data as { full_name: string; display_name: string | null; joined_at: string | null } },
  })
  // Um único Salvar, fixo na base: salva os dados e os dados sensíveis juntos.
  const savers = useRef(new Map<string, () => Promise<boolean | void>>())
  const [saving, setSaving] = useState(false)
  const bindData = useCallback<SaveBinder>((fn) => { if (fn) savers.current.set('data', fn); else savers.current.delete('data') }, [])
  const bindOther = useCallback<SaveBinder>((fn) => { if (fn) savers.current.set('other', fn); else savers.current.delete('other') }, [])
  const bindSens = useCallback<SaveBinder>((fn) => { if (fn) savers.current.set('sens', fn); else savers.current.delete('sens') }, [])
  const saveAll = async () => {
    setSaving(true)
    try { for (const fn of savers.current.values()) { if ((await fn()) === false) break } } catch { /* cada bloco já avisa o erro */ } finally { setSaving(false) }
  }
  if (!membership) return null
  // Titular: o perfil é o do bloco (só os contatos que a Loja, o Site e os e-mails usam).
  if (membership.roles.includes('titular')) return <BlocoProfile memberId={memberId} />
  return (
    <div className="space-y-4">
      <div>
        <h1>Meu perfil</h1>
        {head.data?.joined_at && <p className="text-sm text-muted-foreground">Inscrição em {formatDate(head.data.joined_at)}</p>}
      </div>
      <Card className="p-4">
        <p className="font-display text-lg font-bold">{head.data?.full_name ?? membership.display_name}</p>
        {head.data?.display_name?.trim() && head.data.display_name.trim() !== head.data.full_name && <p className="text-muted-foreground">{head.data.display_name.trim()}</p>}
      </Card>
      <MyData memberId={memberId} bind={bindData} />
      <MySensitiveData memberId={memberId} bind={bindSens} />
      <MyParticipation memberId={memberId} />
      <PixSection memberId={memberId} />
      {(payments.isLoading || (payments.data?.length ?? 0) > 0) && (
        <section className="space-y-2">
          <h3>Pagamentos que recebo</h3>
          {payments.isLoading && <Skeleton className="h-16" />}
          <ProgressiveList items={(payments.data) ?? []} render={(p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div><p className="font-semibold">{p.distribution_destinations?.name ?? 'Equipe'}</p>
                <p className="text-muted-foreground">{p.status === 'paid' ? `Pago em ${formatDate(p.paid_on)}` : p.due_on ? `Previsto ${formatDate(p.due_on)}` : 'Sem data prevista'}</p></div>
              <div className="flex flex-col items-end gap-1"><span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                <Badge className={PAY_STATUS_CLASS[p.status]}>{PAY_STATUS_LABEL[p.status]}</Badge></div>
            </Card>
          )} />
        </section>
      )}
      {/* "Outras informações" vai por último no perfil. */}
      <MyData memberId={memberId} bind={bindOther} part="other" />
      <StickySave><SaveButton type="button" className="w-full" disabled={saving} onClick={saveAll} hint="Salvar meu perfil" /></StickySave>
    </div>
  )
}
