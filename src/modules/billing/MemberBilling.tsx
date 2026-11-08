import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Label, cn } from '@/components/ui/primitives'
import { MemberSection } from '@/modules/members/MemberSection'
import { OkSelect } from '@/components/shared/ConfirmField'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { formatCurrency, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

/** Categorias de contribuição que se escolhem na ficha do integrante. */
const MEMBER_CATEGORIES = ['Aluno', 'Músico', 'Senior', 'Professor', 'Isento']

/** Formulário de bolsa (0–100%). 0% encerra a bolsa. Usado na ficha do integrante e na página de Bolsas. */
export function ScholarshipForm({ memberId, onSaved, onPercent, auto = false }: { memberId: string; onSaved?: () => void; /** Avisa o percentual válido a cada digitação (o valor da mensalidade acompanha). */ onPercent?: (n: number) => void; /** Grava ao sair do campo (sem botão): usado na ficha do integrante. */ auto?: boolean }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const { data: current } = useQuery({
    queryKey: ['scholarship', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('scholarships').select('percent, reason, scholarship_type_id').eq('member_id', memberId).is('valid_to', null).maybeSingle()
      if (error) throw error
      return data as { percent: number; reason: string | null; scholarship_type_id: string | null } | null
    },
  })
  const [percent, setPercent] = useState('0')
  const [reason, setReason] = useState('')
  useEffect(() => {
    setPercent(String(Math.round(Number(current?.percent ?? 0)))); setReason(current?.reason ?? '')
  }, [current])

  const n = Number(percent)
  const valid = percent !== '' && Number.isInteger(n) && n >= 0 && n <= 100
  useEffect(() => { if (valid) onPercent?.(n) }, [n, valid]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_scholarship', {
        p_member: memberId, p_percent: n, p_from: todayIso(membership?.timezone), p_type: current?.scholarship_type_id ?? null, p_reason: reason.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(n === 0 ? 'Bolsa encerrada.' : 'Bolsa atualizada. Vale a partir das próximas cobranças geradas.')
      qc.invalidateQueries({ queryKey: ['scholarship', orgId, memberId] })
      qc.invalidateQueries({ queryKey: ['scholarships', orgId] })
      onSaved?.()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const changed = valid && (n !== Math.round(Number(current?.percent ?? 0)) || reason.trim() !== (current?.reason ?? ''))
  const autoSave = () => { if (auto && changed && !save.isPending) save.mutate() }
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
      <div className="space-y-1.5"><Label htmlFor={`pct-${memberId}`} className={auto ? 'text-xs' : undefined}>Percentual (%)</Label>
        <Input id={`pct-${memberId}`} className={cn('w-16 px-2 text-center', auto && 'h-8 text-sm')} inputMode="numeric" maxLength={3} value={percent} onBlur={autoSave}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); setPercent(d === '' ? '' : String(Math.min(100, Number(d)))) }} /></div>
      <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={`reason-${memberId}`} className={auto ? 'text-xs' : undefined}>Motivo</Label>
        <Input id={`reason-${memberId}`} className={auto ? 'h-8 text-sm' : undefined} placeholder="Opcional" value={reason} onBlur={autoSave} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      {!valid && <p className="text-xs text-destructive">Informe um valor entre 0 e 100.</p>}
      {!auto && <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Salvar bolsa</Button>}
    </div>
  )
}

/** Seção "Contribuição" da ficha do integrante (somente Direção): categoria e bolsa. Dados sensíveis NÃO aparecem aqui. */
export function MemberBilling({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canBilling = usePermission('billing.manage')
  const canSchol = usePermission('scholarships.manage')
  const categories = useCatalog('fee_categories')
  const [livePct, setLivePct] = useState(0)
  // Quem tem atividade remunerada não contribui: a seção some.
  const paid = useQuery({
    queryKey: ['member-links', orgId, memberId, 'has-paid'],
    queryFn: async () => {
      const { count, error } = await supabase.from('member_artistic_links').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('is_paid', true).is('ended_at', null)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })

  const { data: assignment } = useQuery({
    queryKey: ['fee-assignment', orgId, memberId],
    enabled: canBilling,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_fee_assignments').select('fee_category_id').eq('member_id', memberId).is('valid_to', null).maybeSingle()
      if (error) throw error
      return data as { fee_category_id: string } | null
    },
  })
  const price = useQuery({
    queryKey: ['fee-price', orgId, assignment?.fee_category_id],
    enabled: Boolean(assignment?.fee_category_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_category_prices').select('amount').eq('fee_category_id', assignment!.fee_category_id).is('valid_to', null).maybeSingle()
      if (error) throw error
      return data ? Number(data.amount) : null
    },
  })
  const assign = useMutation({
    mutationFn: async (category: string) => {
      const { error } = await supabase.rpc('assign_fee_category', { p_member: memberId, p_category: category || null, p_from: todayIso(membership?.timezone) })
      if (error) throw error
    },
    onSuccess: (_d, category) => {
      const before = assignment?.fee_category_id ?? ''
      const refresh = () => { qc.invalidateQueries({ queryKey: ['fee-assignment', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['members'] }) }
      refresh()
      notifyChange(category ? 'Categoria atualizada.' : 'Pessoa sem contribuição.', async () => {
        const { error } = await supabase.rpc('assign_fee_category', { p_member: memberId, p_category: before || null, p_from: todayIso(membership?.timezone) })
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  if (!canBilling || paid.data) return null
  return (
    <MemberSection title={<>Contribuição mensal{price.data != null && <span className="font-normal text-muted-foreground"> • {formatCurrency(Math.round(price.data * (100 - livePct)) / 100)}</span>}</>}>
      <div className="flex items-center gap-2">
        <Label htmlFor="fee-cat">Categoria</Label>
        <OkSelect id="fee-cat" value={assignment?.fee_category_id ?? ''} disabled={assign.isPending} onSave={(v) => assign.mutateAsync(v)}>
          <option value="">Não contribui</option>
          {categories.data?.filter((c) => MEMBER_CATEGORIES.includes(c.name) || c.id === assignment?.fee_category_id).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </OkSelect>
      </div>
      {canSchol && assignment?.fee_category_id && (
        <div className="space-y-1.5 pt-1">
          <p className="text-sm font-semibold">Bolsa</p>
          <ScholarshipForm memberId={memberId} auto onPercent={setLivePct} />
        </div>
      )}
    </MemberSection>
  )
}
