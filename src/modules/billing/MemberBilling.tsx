import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input, Label, Select, cn } from '@/components/ui/primitives'
import { useCycles } from '@/modules/cycles/service'
import { MemberSection } from '@/modules/members/MemberSection'
import { OkSelect } from '@/components/shared/ConfirmField'
import { PageLink } from '@/components/shared/PageLink'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { Plus } from 'lucide-react'

/** Tipo da categoria (base_key); a chave fixa antiga (system_key) só vale enquanto a categoria não tiver Tipo. */
const isentoKey = (c: { system_key?: string | null; base_key?: string | null }) => c.base_key ?? c.system_key ?? ''
/** Categorias de contribuição que se escolhem na ficha do integrante. */
const MEMBER_CATEGORIES = ['isento']
/** Escolhíveis: as categorias dos contribuintes (grupo Contribuintes em Organização → Categorias) e a fixa "Isento". */
function useIsMemberCategory() {
  const funcs = useCatalog('artistic_functions')
  const payerFns = new Set((funcs.data ?? []).filter((f) => f.kind === 'payer').map((f) => f.id))
  return (c: { system_key?: string | null; base_key?: string | null; function_id?: string | null }) => (c.function_id ? payerFns.has(c.function_id) : false) || MEMBER_CATEGORIES.includes(isentoKey(c))
}

/** Categoria isenta (ex.: Monitor) que a pessoa tem no ciclo: enquanto houver, ela não é cobrada, qualquer que seja a categoria.
 *  Mesma regra da geração: isenção travada sempre vale; senão, a escolha do ciclo (Financeiro → Valores) vence a padrão da categoria. */
function useExemptFunction(memberId: string, cycleId: string | undefined) {
  return useQuery({
    queryKey: ['exempt-function', memberId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const [parts, cyc] = await Promise.all([
        supabase.from('cycle_participations').select('function_id, artistic_functions(name, is_exempt, exempt_locked)').eq('member_id', memberId).eq('cycle_id', cycleId!).not('function_id', 'is', null),
        supabase.from('fee_cycle_exempt').select('function_id, is_exempt').eq('cycle_id', cycleId!),
      ])
      if (parts.error) throw parts.error
      if (cyc.error) throw cyc.error
      const byCycle = new Map((cyc.data ?? []).map((r) => [r.function_id as string, !!r.is_exempt]))
      const rows = (parts.data ?? []) as unknown as { function_id: string; artistic_functions: { name: string; is_exempt: boolean; exempt_locked: boolean } | null }[]
      const f = rows.find((r) => r.artistic_functions && (r.artistic_functions.exempt_locked || (byCycle.get(r.function_id) ?? r.artistic_functions.is_exempt)))
      return f?.artistic_functions?.name ?? null
    },
  }).data ?? null
}

/** Quem é remunerado não contribui (nem é cobrado): a "Categoria" dele é a dos vínculos de participação do ciclo (remunerada e colaborativa). Sem menu de contribuição. */
function ParticipationCategories({ memberId, cycleId }: { memberId: string; cycleId: string }) {
  const rows = useQuery({
    queryKey: ['member-categories', memberId, cycleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_participations').select('is_primary, is_paid, created_at, artistic_functions(name, kind)')
        .eq('member_id', memberId).eq('cycle_id', cycleId).not('function_id', 'is', null).is('instrument_id', null).order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as { is_primary: boolean; is_paid: boolean; artistic_functions: { name: string; kind: string } | null }[]
    },
  })
  const list = (rows.data ?? []).filter((r) => r.artistic_functions).sort((a, b) => Number(b.is_paid) - Number(a.is_paid) || Number(b.is_primary) - Number(a.is_primary))
  const names = [...new Set(list.map((r) => r.artistic_functions!.name))]
  if (names.length === 0) return <p className="text-muted-foreground">Sem categoria neste ciclo. Adicione em Participação.</p>
  return (
    <div className="space-y-1.5">
      <p><span className="font-semibold">Principal:</span> {names[0]}</p>
      {names.length > 1 && (
        <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Também é:</span>
          {names.slice(1).map((n) => <span key={n} className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-sm text-muted-foreground">{n}</span>)}
        </p>
      )}
    </div>
  )
}

/** Naipes da pessoa no ciclo (instrumento ou função): só as categorias do naipe dela, ou sem naipe, podem ser a principal. */
function useMemberSections(memberId: string, cycleId: string | undefined) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['member-cycle-sections', orgId, memberId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_participations').select('instruments(section_id), artistic_functions(section_id)').eq('member_id', memberId).eq('cycle_id', cycleId!)
      if (error) throw error
      const rows = (data ?? []) as unknown as { instruments: { section_id: string | null } | null; artistic_functions: { section_id: string | null } | null }[]
      return rows.map((r) => r.instruments?.section_id ?? r.artistic_functions?.section_id ?? null).filter((x): x is string => !!x)
    },
  })
}
/** A categoria pode ser a principal desta pessoa? Sem naipe na categoria, ou pessoa sem naipe ainda, ou o mesmo naipe; a atual sempre aparece. */
const fitsSections = (c: { id: string; section_id?: string | null }, mine: string[] | undefined, currentId: string) =>
  c.id === currentId || !c.section_id || !mine || mine.length === 0 || mine.includes(c.section_id)

/** Categorias extras do ciclo (ex.: Aluno + Sênior): só marcações; a cobrança segue a categoria principal. Botão "+" abre a escolha. */
function ExtraCategories({ memberId, cycleId, primaryId }: { memberId: string; cycleId: string; primaryId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const categories = useCatalog('fee_categories')
  const isMemberCategory = useIsMemberCategory()
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
  const options = (categories.data ?? []).filter((c) => isMemberCategory(c) && !taken.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
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

/** Formulário de bolsa do ciclo (0–100%), grava ao sair do campo. 0% remove a bolsa do ciclo. Usado na ficha do integrante e na página de Bolsas. */
export function ScholarshipForm({ memberId, cycleId, onSaved, onPercent, auto = false }: { memberId: string; cycleId: string; onSaved?: () => void; /** Avisa o percentual válido a cada digitação (o valor da mensalidade acompanha). */ onPercent?: (n: number) => void; /** Versão compacta, dentro da ficha do integrante. */ auto?: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: current, isSuccess } = useQuery({
    queryKey: ['scholarship', orgId, memberId, cycleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_scholarships').select('percent, reason, scholarship_type_id').eq('member_id', memberId).eq('cycle_id', cycleId).maybeSingle()
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
  useEffect(() => { if (valid) onPercent?.(n) }, [n, valid])
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_cycle_scholarship', {
        p_member: memberId, p_cycle: cycleId, p_percent: n, p_type: current?.scholarship_type_id ?? null, p_reason: reason.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(n === 0 ? 'Bolsa removida do ciclo.' : 'Bolsa do ciclo atualizada. Vale a partir das próximas cobranças geradas.')
      qc.invalidateQueries({ queryKey: ['scholarship', orgId, memberId, cycleId] })
      qc.invalidateQueries({ queryKey: ['scholarships', orgId] })
      qc.invalidateQueries({ queryKey: ['members'] })
      onSaved?.()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const changed = valid && (n !== Math.round(Number(current?.percent ?? 0)) || reason.trim() !== (current?.reason ?? ''))
  const autoSave = () => { if (isSuccess && changed && !save.isPending) save.mutate() }
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
      <div className="space-y-1.5"><Label htmlFor={`pct-${memberId}-${cycleId}`} className={auto ? 'text-xs' : undefined}>Percentual (%)</Label>
        <Input id={`pct-${memberId}-${cycleId}`} className={cn('w-16 px-2 text-center', auto && 'h-8 text-sm')} inputMode="numeric" maxLength={3} value={percent} onBlur={autoSave}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); setPercent(d === '' ? '' : String(Math.min(100, Number(d)))) }} /></div>
      <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={`reason-${memberId}-${cycleId}`} className={auto ? 'text-xs' : undefined}>Motivo</Label>
        <Input id={`reason-${memberId}-${cycleId}`} className={auto ? 'h-8 text-sm' : undefined} placeholder="Motivo" value={reason} onBlur={autoSave} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      {!valid && <p className="text-xs text-destructive">Informe um valor entre 0 e 100.</p>}
    </div>
  )
}

type CycleWindow = { id: string; name?: string; starts_on: string; ends_on: string; is_current: boolean }

/** Seção "Contribuição" da ficha do integrante (quem cuida das cobranças), num ciclo: categoria e bolsa daquele ciclo, editáveis.
 *  O ciclo atual e os outros seguem a mesma regra e as mesmas tabelas (cycle_fee_assignments, fee_cycle_prices, cycle_scholarships). */
function CycleBilling({ memberId, cycle }: { memberId: string; cycle: CycleWindow }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canSchol = usePermission('scholarships.manage')
  const categories = useCatalog('fee_categories')
  const isMemberCategory = useIsMemberCategory()
  const mySections = useMemberSections(memberId, cycle.id)
  const [livePct, setLivePct] = useState(0)
  const info = useQuery({
    queryKey: ['cycle-billing', orgId, memberId, cycle.id],
    queryFn: async () => {
      const [a, l] = await Promise.all([
        supabase.from('cycle_fee_assignments').select('fee_category_id').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle(),
        supabase.from('cycle_participations').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('cycle_id', cycle.id).eq('is_paid', true),
      ])
      if (a.error) throw a.error
      if (l.error) throw l.error
      return { catId: (a.data as { fee_category_id: string } | null)?.fee_category_id ?? '', paid: (l.count ?? 0) > 0 }
    },
  })
  const catId = info.data?.catId ?? ''
  const exemptBy = useExemptFunction(memberId, cycle.id)
  const price = useQuery({
    queryKey: ['cycle-price', orgId, catId, cycle.id],
    enabled: !!catId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_cycle_prices').select('amount').eq('fee_category_id', catId).eq('cycle_id', cycle.id).maybeSingle()
      if (error) throw error
      return data ? Number(data.amount) : null
    },
  })
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

  if (!info.data) return null
  if (info.data.paid) {
    return (
      <MemberSection title="Categoria">
        <ParticipationCategories memberId={memberId} cycleId={cycle.id} />
        <p className="pt-1 text-xs text-muted-foreground">Atividade remunerada no ciclo: não paga mensalidade.</p>
      </MemberSection>
    )
  }
  const cat = categories.data?.find((c) => c.id === catId)
  const isIsento = cat ? isentoKey(cat) === 'isento' : false
  const hint = exemptBy ? `Isento pela categoria ${exemptBy}: não é cobrado enquanto tiver essa função.`
    : catId && price.isSuccess && price.data == null ? <>Categoria sem valor neste ciclo: defina em <PageLink to="valores">Financeiro → Valores</PageLink>.</>
    : 'Só ela define o valor cobrado.'
  return (
    <MemberSection title={<>Contribuição mensal{exemptBy ? <span className="font-normal text-muted-foreground"> • Isento</span> : price.data != null && <span className="font-normal text-muted-foreground"> • {formatCurrency(Math.round(price.data * (100 - livePct)) / 100)}</span>}</>}>
      <div className="space-y-1">
        <Label htmlFor={'cc-cat-' + cycle.id} className="block">Categoria principal</Label>
          <OkSelect id={'cc-cat-' + cycle.id} value={catId} disabled={setCategory.isPending} onSave={(v) => setCategory.mutateAsync(v)}>
            {!catId && <option value="">Escolha a categoria</option>}
            {categories.data?.filter((c) => ((isMemberCategory(c) && isentoKey(c) !== 'isento') || c.id === catId) && fitsSections(c, mySections.data, catId)).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </OkSelect>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {catId && <ExtraCategories memberId={memberId} cycleId={cycle.id} primaryId={catId} />}
      {canSchol && catId && !isIsento && !exemptBy && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-sm font-semibold">Bolsa</p>
          <ScholarshipForm memberId={memberId} cycleId={cycle.id} auto onPercent={setLivePct} />
        </div>
      )}
    </MemberSection>
  )
}

/** Contribuição na ficha do integrante: a do ciclo mostrado (ou a do atual). Só para quem cuida das cobranças. */
export function MemberBilling({ memberId, cycle }: { memberId: string; /** Ciclo mostrado; sem ele, o atual. */ cycle?: CycleWindow }) {
  const canBilling = usePermission('billing.manage')
  const cycles = useCycles()
  const shown = cycle ?? cycles.data?.find((c) => c.is_current)
  if (!canBilling || !shown) return null
  return <CycleBilling key={shown.id} memberId={memberId} cycle={shown} />
}
