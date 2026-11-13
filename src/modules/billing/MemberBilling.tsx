import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Label, Select, cn } from '@/components/ui/primitives'
import { useCycles } from '@/modules/cycles/service'
import { MemberSection } from '@/modules/members/MemberSection'
import { OkSelect } from '@/components/shared/ConfirmField'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { formatCurrency, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { Plus, Save } from 'lucide-react'

/** Categorias de contribuição que se escolhem na ficha do integrante. */
const MEMBER_CATEGORIES = ['Aluno', 'Músico', 'Senior', 'Professor', 'Isento']

/** Categorias extras do ciclo (ex.: Aluno + Sênior): só marcações; a cobrança segue a categoria principal. Botão "+" abre a escolha. */
function ExtraCategories({ memberId, cycleId, primaryId }: { memberId: string; cycleId: string; primaryId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const categories = useCatalog('fee_categories')
  const [adding, setAdding] = useState(false)
  const key = ['extra-categories', orgId, memberId, cycleId]
  const extras = useQuery({
    queryKey: key,
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_extra_categories').select('fee_category_id').eq('member_id', memberId).eq('cycle_id', cycleId)
      if (error) throw error
      return (data ?? []).map((r) => r.fee_category_id as string)
    },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['members'] }) }
  const add = useMutation({
    mutationFn: async (cat: string) => {
      const { error } = await supabase.from('cycle_extra_categories').insert({ organization_id: orgId, member_id: memberId, cycle_id: cycleId, fee_category_id: cat })
      if (error) throw error
    },
    onSuccess: () => { setAdding(false); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (cat: string) => {
      const { error } = await supabase.from('cycle_extra_categories').delete().eq('member_id', memberId).eq('cycle_id', cycleId).eq('fee_category_id', cat)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  const name = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? '—'
  const taken = new Set([primaryId, ...(extras.data ?? [])])
  const options = (categories.data ?? []).filter((c) => MEMBER_CATEGORIES.includes(c.name) && !taken.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">Também é:</span>
      {adding ? (
        <Select aria-label="Outra categoria" autoFocus defaultValue="" disabled={add.isPending} onChange={(e) => { if (e.target.value) add.mutate(e.target.value) }} onBlur={() => setAdding(false)}>
          <option value="">Escolha</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      ) : options.length > 0 && (
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Acumular outra categoria" title="Acumular outra categoria" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /></button>
      )}
      {(extras.data ?? []).map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground">
          {name(id)}
          <button type="button" aria-label={`Remover ${name(id)}`} title="Remover" disabled={remove.isPending} className="rounded-full px-1 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(id)}>×</button>
        </span>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">Marcações para filtros e listas; não alteram o valor.</p>
    </div>
  )
}

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
        <Input id={`reason-${memberId}`} className={auto ? 'h-8 text-sm' : undefined} placeholder="Motivo" value={reason} onBlur={autoSave} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      {!valid && <p className="text-xs text-destructive">Informe um valor entre 0 e 100.</p>}
      {!auto && <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()} aria-label="Salvar bolsa" title="Salvar bolsa"><Save className="h-4 w-4" /></Button>}
    </div>
  )
}

/** Seção "Contribuição" da ficha do integrante (somente Direção): categoria e bolsa. Dados sensíveis NÃO aparecem aqui. */
type CycleWindow = { id: string; name?: string; starts_on: string; ends_on: string; is_current: boolean }

/** Contribuição de um ciclo que não é o atual (passado ou futuro): categoria e bolsa daquele ciclo, editáveis. */
function CycleBilling({ memberId, cycle }: { memberId: string; cycle: CycleWindow }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canBilling = usePermission('billing.manage')
  const canSchol = usePermission('scholarships.manage')
  const categories = useCatalog('fee_categories')
  const today = todayIso(membership?.timezone)
  const info = useQuery({
    queryKey: ['cycle-billing', orgId, memberId, cycle.id],
    queryFn: async () => {
      const a = await supabase.from('cycle_fee_assignments').select('fee_category_id').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()
      if (a.error) throw a.error
      const s = await supabase.from('cycle_scholarships').select('percent, reason').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()
      if (s.error) throw s.error
      const l = await supabase.from('cycle_participations').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('cycle_id', cycle.id).eq('is_paid', true)
      if (l.error) throw l.error
      return { catId: (a.data as { fee_category_id: string } | null)?.fee_category_id ?? '', sch: s.data as { percent: number; reason: string | null } | null, paid: (l.count ?? 0) > 0 }
    },
  })
  const catId = info.data?.catId ?? ''
  const priceDate = cycle.ends_on < today ? cycle.ends_on : today
  const price = useQuery({
    queryKey: ['cycle-price', orgId, catId, priceDate],
    enabled: !!catId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_category_prices').select('amount').eq('fee_category_id', catId).lte('valid_from', priceDate).or('valid_to.is.null,valid_to.gte.' + priceDate).order('valid_from', { ascending: false }).limit(1)
      if (error) throw error
      return data?.[0] ? Number(data[0].amount) : null
    },
  })
  const [pct, setPct] = useState('0')
  const [reason, setReason] = useState('')
  useEffect(() => { setPct(String(Math.round(Number(info.data?.sch?.percent ?? 0)))); setReason(info.data?.sch?.reason ?? '') }, [info.data])
  const refresh = () => { qc.invalidateQueries({ queryKey: ['cycle-billing', orgId, memberId, cycle.id] }); qc.invalidateQueries({ queryKey: ['members'] }) }

  const setCategory = useMutation({
    mutationFn: async (category: string) => {
      const ex = await supabase.from('cycle_fee_assignments').select('id').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()
      if (ex.error) throw ex.error
      const prev = catId
      if (!category) { const { error } = await supabase.from('cycle_fee_assignments').delete().eq('member_id', memberId).eq('cycle_id', cycle.id); if (error) throw error }
      else if (ex.data) { const { error } = await supabase.from('cycle_fee_assignments').update({ fee_category_id: category }).eq('id', (ex.data as { id: string }).id); if (error) throw error }
      else { const { error } = await supabase.from('cycle_fee_assignments').insert({ organization_id: orgId, member_id: memberId, cycle_id: cycle.id, fee_category_id: category }); if (error) throw error }
      return prev
    },
    onSuccess: (prev, category) => {
      refresh()
      notifyChange(category ? 'Categoria do ciclo atualizada.' : 'Pessoa sem contribuição neste ciclo.', async () => { await setCategory.mutateAsync(prev) })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const n = Number(pct)
  const valid = pct !== '' && Number.isInteger(n) && n >= 0 && n <= 100
  const saveSch = useMutation({
    mutationFn: async () => {
      const ex = await supabase.from('cycle_scholarships').select('id').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()
      if (ex.error) throw ex.error
      if (n === 0) { const { error } = await supabase.from('cycle_scholarships').delete().eq('member_id', memberId).eq('cycle_id', cycle.id); if (error) throw error; return }
      const row = { percent: n, reason: reason.trim() || null }
      if (ex.data) { const { error } = await supabase.from('cycle_scholarships').update(row).eq('id', (ex.data as { id: string }).id); if (error) throw error }
      else { const { error } = await supabase.from('cycle_scholarships').insert({ organization_id: orgId, member_id: memberId, cycle_id: cycle.id, ...row }); if (error) throw error }
    },
    onSuccess: () => { toast.success(n === 0 ? 'Bolsa removida do ciclo.' : 'Bolsa do ciclo atualizada.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const changed = valid && (n !== Math.round(Number(info.data?.sch?.percent ?? 0)) || reason.trim() !== (info.data?.sch?.reason ?? ''))
  const autoSave = () => { if (changed && !saveSch.isPending) saveSch.mutate() }

  if (!canBilling || !info.data || info.data.paid) return null
  const catName = categories.data?.find((c) => c.id === catId)?.name
  return (
    <MemberSection title={<>Contribuição mensal{price.data != null && <span className="font-normal text-muted-foreground"> • {formatCurrency(Math.round(price.data * (100 - (valid ? n : 0))) / 100)}</span>}</>}>
      <div className="space-y-1">
        <Label htmlFor={'cc-cat-' + cycle.id} className="block">Categoria principal</Label>
          <OkSelect id={'cc-cat-' + cycle.id} value={catId} disabled={setCategory.isPending} onSave={(v) => setCategory.mutateAsync(v)}>
            <option value="">Não contribui</option>
            {categories.data?.filter((c) => MEMBER_CATEGORIES.includes(c.name) || c.id === catId).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </OkSelect>
        <p className="text-xs text-muted-foreground">Só ela define o valor cobrado.</p>
      </div>
      {catId && <ExtraCategories memberId={memberId} cycleId={cycle.id} primaryId={catId} />}
      {canSchol && catId && catName !== 'Isento' && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-sm font-semibold">Bolsa</p>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5"><Label htmlFor={'cc-pct-' + cycle.id} className="text-xs">Percentual (%)</Label>
              <Input id={'cc-pct-' + cycle.id} className="h-8 w-16 px-2 text-center text-sm" inputMode="numeric" maxLength={3} value={pct} onBlur={autoSave}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); setPct(d === '' ? '' : String(Math.min(100, Number(d)))) }} /></div>
            <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={'cc-reason-' + cycle.id} className="text-xs">Motivo</Label>
              <Input id={'cc-reason-' + cycle.id} className="h-8 text-sm" placeholder="Motivo" value={reason} onBlur={autoSave} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
        </div>
      )}
    </MemberSection>
  )
}

export function MemberBilling({ memberId, cycle }: { memberId: string; /** Ciclo mostrado; os que já passaram aparecem só para leitura. */ cycle?: CycleWindow }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canBilling = usePermission('billing.manage')
  const canSchol = usePermission('scholarships.manage')
  const categories = useCatalog('fee_categories')
  const [livePct, setLivePct] = useState(0)
  const currentCycleId = useCycles().data?.find((c) => c.is_current)?.id ?? ''
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

  if (canBilling && cycle && !cycle.is_current) return <CycleBilling memberId={memberId} cycle={cycle} />
  if (!canBilling || paid.data) return null
  return (
    <MemberSection title={<>Contribuição mensal{price.data != null && <span className="font-normal text-muted-foreground"> • {formatCurrency(Math.round(price.data * (100 - livePct)) / 100)}</span>}</>}>
      <div className="space-y-1">
        <Label htmlFor="fee-cat" className="block">Categoria principal</Label>
          <OkSelect id="fee-cat" value={assignment?.fee_category_id ?? ''} disabled={assign.isPending} onSave={(v) => assign.mutateAsync(v)}>
            <option value="">Não contribui</option>
            {categories.data?.filter((c) => MEMBER_CATEGORIES.includes(c.name) || c.id === assignment?.fee_category_id).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </OkSelect>
        <p className="text-xs text-muted-foreground">Só ela define o valor cobrado.</p>
      </div>
      {assignment?.fee_category_id && currentCycleId && <ExtraCategories memberId={memberId} cycleId={currentCycleId} primaryId={assignment.fee_category_id} />}
      {canSchol && assignment?.fee_category_id && categories.data?.find((c) => c.id === assignment.fee_category_id)?.name !== 'Isento' && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-sm font-semibold">Bolsa</p>
          <ScholarshipForm memberId={memberId} auto onPercent={setLivePct} />
        </div>
      )}
    </MemberSection>
  )
}
