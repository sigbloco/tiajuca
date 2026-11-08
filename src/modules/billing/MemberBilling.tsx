import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Label } from '@/components/ui/primitives'
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
export function ScholarshipForm({ memberId, onSaved }: { memberId: string; onSaved?: () => void }) {
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

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
      <div className="space-y-1.5"><Label htmlFor={`pct-${memberId}`}>Percentual (%)</Label>
        <Input id={`pct-${memberId}`} className="w-16 px-2 text-center" inputMode="numeric" maxLength={3} value={percent}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); setPercent(d === '' ? '' : String(Math.min(100, Number(d)))) }} /></div>
      <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={`reason-${memberId}`}>Motivo</Label>
        <Input id={`reason-${memberId}`} placeholder="Opcional" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      {!valid && <p className="text-xs text-destructive">Informe um valor entre 0 e 100.</p>}
      <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Salvar bolsa</Button>
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

  if (!canBilling) return null
  return (
    <MemberSection title={<>Contribuição mensal{price.data != null && <span className="font-normal text-muted-foreground"> • {formatCurrency(price.data)}</span>}</>}>
      <Card className="space-y-2 p-3">
        <Label htmlFor="fee-cat">Categoria</Label>
<OkSelect id="fee-cat" value={assignment?.fee_category_id ?? ''} disabled={assign.isPending} onSave={(v) => assign.mutateAsync(v)}>
          <option value="">Não contribui</option>
          {categories.data?.filter((c) => MEMBER_CATEGORIES.includes(c.name) || c.id === assignment?.fee_category_id).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </OkSelect>
      </Card>
      {canSchol && (
        <Card className="space-y-2 p-3">
          <h3 className="text-sm">Bolsa</h3>
          <ScholarshipForm memberId={memberId} />
        </Card>
      )}
    </MemberSection>
  )
}
