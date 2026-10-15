import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDate } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
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
        <Input className="sm:col-span-2" aria-label="Chave" placeholder="Digite a nova chave" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button size="sm" disabled={!value.trim() || save.isPending} onClick={() => save.mutate()}>Salvar chave</Button>
      <p className="text-xs text-muted-foreground">Só você e a Direção veem a chave. Ao trocar, a anterior é arquivada e os pagamentos passados mantêm a chave usada na época.</p>
    </Card>
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
  if (!membership) return null
  return (
    <div className="space-y-4">
      <h1>Meu perfil</h1>
      <Card className="p-4">
        <p className="font-display text-lg font-bold">{membership.display_name}</p>
        <p className="text-muted-foreground">{membership.name}</p>
      </Card>
      <PixSection memberId={memberId} />
      {(payments.isLoading || (payments.data?.length ?? 0) > 0) && (
        <section className="space-y-2">
          <h3>Meus pagamentos</h3>
          {payments.isLoading && <Skeleton className="h-16" />}
          {payments.data?.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div><p className="font-semibold">{p.distribution_destinations?.name ?? 'Equipe'}</p>
                <p className="text-muted-foreground">{p.status === 'paid' ? `Pago em ${formatDate(p.paid_on)}` : p.due_on ? `Previsto ${formatDate(p.due_on)}` : 'Sem data prevista'}</p></div>
              <div className="flex flex-col items-end gap-1"><span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                <Badge className={PAY_STATUS_CLASS[p.status]}>{PAY_STATUS_LABEL[p.status]}</Badge></div>
            </Card>
          ))}
        </section>
      )}
      {payments.data?.length === 0 && <EmptyState>Você não tem pagamentos registrados.</EmptyState>}
    </div>
  )
}
