import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Label, Select } from '@/components/ui/primitives'
import { OkSelect } from '@/components/shared/ConfirmField'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { formatCurrency, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

const QUICK = [0, 25, 50, 75, 100]

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
  const types = useQuery({
    queryKey: ['scholarship-types', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('scholarship_types').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const [percent, setPercent] = useState('0')
  const [reason, setReason] = useState('')
  const [type, setType] = useState('')
  useEffect(() => {
    setPercent(String(current?.percent ?? 0)); setReason(current?.reason ?? ''); setType(current?.scholarship_type_id ?? '')
  }, [current])

  const n = Number(percent.replace(',', '.'))
  const valid = percent !== '' && Number.isFinite(n) && n >= 0 && n <= 100
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_scholarship', {
        p_member: memberId, p_percent: n, p_from: todayIso(membership?.timezone), p_type: type || null, p_reason: reason.trim() || null,
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
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Button key={q} type="button" size="sm" variant={Number(percent) === q ? 'default' : 'outline'} onClick={() => setPercent(String(q))}>
            {q === 0 ? 'Sem bolsa' : q === 100 ? '100% (isento)' : `${q}%`}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5"><Label htmlFor={`pct-${memberId}`}>Percentual (%)</Label>
          <Input id={`pct-${memberId}`} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, ''))} /></div>
        <div className="space-y-1.5"><Label htmlFor={`type-${memberId}`}>Tipo</Label>
          <Select id={`type-${memberId}`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Sem tipo</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select></div>
      </div>
      <Input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
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
    <section className="space-y-2">
      <h3>Contribuição mensal</h3>
      <Card className="space-y-2 p-3">
        <Label htmlFor="fee-cat">Categoria</Label>
<OkSelect id="fee-cat" value={assignment?.fee_category_id ?? ''} disabled={assign.isPending} onSave={(v) => assign.mutateAsync(v)}>
          <option value="">Não contribui</option>
          {categories.data?.filter((c) => c.is_active || c.id === assignment?.fee_category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </OkSelect>
        {price.data != null && <p className="text-muted-foreground">Valor atual da categoria: {formatCurrency(price.data)}/mês</p>}
      </Card>
      {canSchol && (
        <Card className="space-y-2 p-3">
          <h3 className="text-sm">Bolsa</h3>
          <ScholarshipForm memberId={memberId} />
        </Card>
      )}
    </section>
  )
}
