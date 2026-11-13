import { audienceSectionIds, getAudiencesFor } from '@/modules/events/service'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { ReadMore } from '@/components/shared/ReadMore'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, shortName, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { useCycles } from '@/modules/cycles/service'
import { MemberLink } from '@/modules/members/MemberLink'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { StaffTab } from './StaffTab'

type Scope = 'all' | 'section' | 'instrument'
type Kind = 'fixed' | 'percent' | 'hourly'
interface Rule {
  id?: string
  kind: Kind
  fixed_amount: number | null
  percent: number | null
  hourly_rate: number | null
  scope: Scope
  section_id: string | null
  instrument_id: string | null
}
interface RuleRow extends Rule { id: string; member_id: string; members: { full_name: string; display_name: string | null } | null }
interface Person { id: string; name: string; kinds: string[] }
interface Lesson { id: string; title: string; activity_date: string; start_time: string | null; end_time: string | null; status: string; activity_types: { name: string } | null }

const SCOPE_LABEL: Record<Scope, string> = { all: 'Receita total das oficinas', section: 'Um naipe', instrument: 'Um instrumento' }
const EMPTY_RULE: Rule = { kind: 'percent', fixed_amount: null, percent: null, hourly_rate: null, scope: 'all', section_id: null, instrument_id: null }
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/s$/, '')
const hoursOf = (l: Lesson) => {
  if (!l.start_time || !l.end_time) return 1
  const [h1, m1] = l.start_time.split(':').map(Number), [h2, m2] = l.end_time.split(':').map(Number)
  const h = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60
  return h > 0 ? h : 1
}

/** Grupos da lista, na ordem em que aparecem. */
const GROUPS: { key: string; label: string }[] = [
  { key: 'Direção', label: 'Direção' }, { key: 'Professor', label: 'Professores' }, { key: 'Monitor', label: 'Monitores' }, { key: 'Regência', label: 'Regência' }, { key: '', label: 'Outros' },
]

/** Formulário de uma regra: fixo, % (de tudo, naipe ou instrumento) ou valor por hora de aula. */
function RuleEditor({ rule, memberId, cycleId, canEdit, onDone }: { rule: Rule; memberId: string; cycleId: string; canEdit: boolean; onDone: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const [r, setR] = useState<Rule>(rule)
  const [pct, setPct] = useState(rule.percent === null ? '' : String(rule.percent).replace('.', ','))
  const percent = Number(pct.replace(',', '.'))
  const target = r.scope === 'section' ? r.section_id : r.instrument_id
  const valid = r.kind === 'fixed' ? r.fixed_amount !== null && r.fixed_amount >= 0
    : r.kind === 'hourly' ? r.hourly_rate !== null && r.hourly_rate >= 0 && (r.scope === 'all' || !!r.section_id)
      : Number.isFinite(percent) && percent > 0 && percent <= 100 && (r.scope === 'all' || !!target)
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-pay-rules', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      const pctRule = r.kind === 'percent'
      const row = {
        kind: r.kind, scope: r.kind === 'fixed' ? 'all' : r.kind === 'hourly' ? (r.scope === 'section' ? 'section' : 'all') : r.scope,
        fixed_amount: r.kind === 'fixed' ? r.fixed_amount : null, percent: pctRule ? percent : null, hourly_rate: r.kind === 'hourly' ? r.hourly_rate : null,
        section_id: (pctRule || r.kind === 'hourly') && r.scope === 'section' ? r.section_id : null,
        instrument_id: pctRule && r.scope === 'instrument' ? r.instrument_id : null,
      }
      const q = rule.id ? supabase.from('staff_pay_rules').update(row).eq('id', rule.id)
        : supabase.from('staff_pay_rules').insert({ ...row, organization_id: orgId, cycle_id: cycleId, member_id: memberId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Regra salva.'); refresh(); onDone() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const naipeSelect = (
    <Select aria-label="Naipe" disabled={!canEdit} value={r.section_id ?? ''} onChange={(e) => setR({ ...r, section_id: e.target.value || null })}>
      <option value="">Escolha o naipe</option>{(sections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  )
  return (
    <div className="space-y-1.5 rounded-lg bg-muted/50 p-2">
      <Select aria-label="Tipo" disabled={!canEdit} value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as Kind, scope: 'all', section_id: null, instrument_id: null })}>
        <option value="percent">Porcentagem</option><option value="fixed">Valor fixo</option><option value="hourly">Por hora de aula</option>
      </Select>
      {r.kind === 'fixed' && <MoneyInput value={r.fixed_amount} onChange={(v) => setR({ ...r, fixed_amount: v })} />}
      {r.kind === 'percent' && (
        <>
          <div className="flex items-center gap-1"><Input aria-label="Porcentagem" inputMode="decimal" disabled={!canEdit} placeholder="0" value={pct} onChange={(e) => setPct(e.target.value)} /><span className="font-semibold">%</span></div>
          <Select aria-label="Sobre" disabled={!canEdit} value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value as Scope, section_id: null, instrument_id: null })}>
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
          </Select>
          {r.scope === 'section' && naipeSelect}
          {r.scope === 'instrument' && (
            <Select aria-label="Instrumento" disabled={!canEdit} value={r.instrument_id ?? ''} onChange={(e) => setR({ ...r, instrument_id: e.target.value || null })}>
              <option value="">Escolha o instrumento</option>{(instruments.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </>
      )}
      {r.kind === 'hourly' && (
        <>
          <div className="flex items-center gap-1"><MoneyInput value={r.hourly_rate} onChange={(v) => setR({ ...r, hourly_rate: v })} /><span className="shrink-0 font-semibold">por hora</span></div>
          <Select aria-label="Aulas" disabled={!canEdit} value={r.scope === 'section' ? 'section' : 'all'} onChange={(e) => setR({ ...r, scope: e.target.value as Scope, section_id: null })}>
            <option value="all">Todas as oficinas</option><option value="section">Oficinas de um naipe</option>
          </Select>
          {r.scope === 'section' && naipeSelect}
          <p className="text-sm text-muted-foreground">Vale as horas das aulas do mês que não foram canceladas (feriado e chuva ficam de fora ao cancelar a aula no Calendário).</p>
        </>
      )}
      {canEdit && (
        <div className="flex gap-1">
          <Button size="icon" aria-label="Salvar regra" title="Salvar" disabled={!valid || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" aria-label="Cancelar" title="Cancelar" onClick={onDone}><X className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}

/** Regra pronta: uma linha curta ("3,5% da receita total das oficinas") com editar e apagar. */
function RuleLine({ rule, memberId, cycleId, canEdit, summary, detail }: { rule: RuleRow; memberId: string; cycleId: string; canEdit: boolean; summary: string; detail: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('staff_pay_rules').delete().eq('id', rule.id); if (error) throw error },
    onSuccess: () => { notifySaved('Regra removida.'); qc.invalidateQueries({ queryKey: ['staff-pay-rules', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (editing) return <RuleEditor rule={rule} memberId={memberId} cycleId={cycleId} canEdit={canEdit} onDone={() => setEditing(false)} />
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="font-semibold">{summary}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      {canEdit && (
        <div className="flex shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar regra" title="Editar" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Remover regra" title="Remover regra" onClick={async () => { if (await confirmBox('Remover esta regra de pagamento?')) del.mutate() }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}

/** Equipe: quem recebe no ciclo e como (fixo, % ou por hora de aula), com o previsto do mês. */
export function TeamPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canEdit = usePermission('finance.manage')
  const today = todayIso(membership?.timezone)
  const { cycleId } = useSelectedCycle()
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  const competence = toCompetence(ym)
  const cycles = useCycles()
  const cycle = (cycles.data ?? []).find((c) => c.id === cycleId)
  const [drafts, setDrafts] = useState<Record<string, number[]>>({})
  const [extra, setExtra] = useState<Person[]>([])
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const instruments = useCatalog('instruments')
  const sections = useCatalog('sections')

  const rules = useQuery({
    queryKey: ['staff-pay-rules', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_pay_rules').select('id, member_id, kind, fixed_amount, percent, hourly_rate, scope, section_id, instrument_id, members(full_name, display_name)')
        .eq('organization_id', orgId).eq('cycle_id', cycleId).order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as RuleRow[]
    },
  })
  const staff = useQuery({
    // Quem tem participação remunerada na ficha neste ciclo (ciclo atual: vínculos vigentes; outro ciclo: a participação daquele ciclo).
    queryKey: ['member-links', orgId, 'team-paid', cycleId, cycle?.is_current ?? null],
    enabled: Boolean(cycleId && cycle),
    queryFn: async () => {
      const sel = 'member_id, artistic_functions(name), members(full_name, display_name)'
      type R = { member_id: string; artistic_functions: { name: string } | null; members: { full_name: string; display_name: string | null } | null }
      let rows: R[]
      if (cycle!.is_current) {
        const { data, error } = await supabase.from('member_artistic_links').select(sel).eq('organization_id', orgId).eq('is_paid', true).not('function_id', 'is', null).is('ended_at', null).limit(3000)
        if (error) throw error
        rows = (data ?? []) as unknown as R[]
      } else {
        const { data, error } = await supabase.from('cycle_participations').select(sel).eq('organization_id', orgId).eq('cycle_id', cycleId).eq('is_paid', true).not('function_id', 'is', null).limit(3000)
        if (error) throw error
        rows = (data ?? []) as unknown as R[]
      }
      return rows.map((r) => ({ member_id: r.member_id, staff_kind: r.artistic_functions?.name ?? '', members: r.members }))
    },
  })
  // Base do %: cobranças pagas no mês, por pessoa, e o instrumento de cada uma no ciclo.
  const paid = useQuery({
    queryKey: ['team-revenue', orgId, competence],
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_charges').select('member_id, final_amount').eq('organization_id', orgId).eq('competence', competence).eq('status', 'paid').limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; final_amount: number }[]
    },
  })
  const parts = useQuery({
    queryKey: ['team-participations', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_participations').select('member_id, instrument_id').eq('organization_id', orgId).eq('cycle_id', cycleId).not('instrument_id', 'is', null).limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; instrument_id: string }[]
    },
  })
  // Aulas (oficinas) do mês que não foram canceladas: base do pagamento por hora.
  const lessons = useQuery({
    queryKey: ['team-lessons', orgId, competence],
    queryFn: async () => {
      const last = new Date(Date.UTC(ym.y, ym.m + 1, 0)).toISOString().slice(0, 10)
      const { data, error } = await supabase.from('activities').select('id, title, activity_date, start_time, end_time, status, activity_types(name)')
        .eq('organization_id', orgId).gte('activity_date', competence).lte('activity_date', last).neq('status', 'cancelled').limit(2000)
      if (error) throw error
      return ((data ?? []) as unknown as Lesson[]).filter((l) => l.activity_types?.name === 'Oficina')
    },
  })
  const payments = useQuery({
    queryKey: ['staff-payments-month', orgId, competence],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_payments').select('member_id, status').eq('organization_id', orgId).eq('competence', competence).neq('status', 'cancelled')
      if (error) throw error
      return (data ?? []) as { member_id: string; status: string }[]
    },
  })

  const people = useMemo(() => {
    const map = new Map<string, Person>()
    for (const s of staff.data ?? []) {
      const p = map.get(s.member_id) ?? { id: s.member_id, name: shortName(s.members?.full_name, s.members?.display_name), kinds: [] }
      if (!p.kinds.includes(s.staff_kind)) p.kinds.push(s.staff_kind)
      map.set(s.member_id, p)
    }
    for (const r of rules.data ?? []) if (!map.has(r.member_id)) map.set(r.member_id, { id: r.member_id, name: shortName(r.members?.full_name, r.members?.display_name), kinds: [] })
    for (const e of extra) if (!map.has(e.id)) map.set(e.id, e)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [staff.data, rules.data, extra])
  const groupOf = (p: Person) => GROUPS.find((g) => g.key && p.kinds.includes(g.key))?.key ?? ''

  const revenueOf = useMemo(() => {
    const inst = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const byMember = new Map<string, string[]>()
    for (const p of parts.data ?? []) byMember.set(p.member_id, [...(byMember.get(p.member_id) ?? []), p.instrument_id])
    return (rule: Rule) => (paid.data ?? []).reduce((sum, c) => {
      if (rule.scope === 'all') return sum + Number(c.final_amount)
      const ids = byMember.get(c.member_id) ?? []
      const hit = ids.some((id) => {
        const i = inst.get(id)
        return !!i && (rule.scope === 'instrument' ? i.id === rule.instrument_id : i.section_id === rule.section_id)
      })
      return hit ? sum + Number(c.final_amount) : sum
    }, 0)
  }, [paid.data, parts.data, instruments.data])
  /** Aulas do mês que entram na regra por hora (todas as oficinas ou as de um naipe, pelo nome no título). */
  // Aula com público definido conta para o naipe do público; sem público, vale o nome do naipe no título.
  const lessonAudiences = useQuery({ queryKey: ['audiences-lessons', orgId, competence, (lessons.data ?? []).length], enabled: (lessons.data?.length ?? 0) > 0, queryFn: () => getAudiencesFor((lessons.data ?? []).map((l) => l.id)) })
  const lessonsOf = (rule: Rule) => {
    const sec = rule.scope === 'section' ? sections.data?.find((s) => s.id === rule.section_id) : undefined
    const instSection = new Map((instruments.data ?? []).map((i) => [i.id, i.section_id as string]))
    return (lessons.data ?? []).filter((l) => {
      if (rule.scope !== 'section') return true
      const aud = lessonAudiences.data?.get(l.id)
      if (aud && aud.length > 0) return audienceSectionIds(aud, instSection).has(rule.section_id as string)
      return !!sec && plain(l.title).includes(plain(sec.name))
    })
  }
  const hoursFor = (rule: Rule) => lessonsOf(rule).reduce((n, l) => n + hoursOf(l), 0)
  const amountOf = (r: Rule) => (r.kind === 'fixed' ? Number(r.fixed_amount ?? 0)
    : r.kind === 'hourly' ? Math.round(hoursFor(r) * Number(r.hourly_rate ?? 0) * 100) / 100
      : Math.round(revenueOf(r) * Number(r.percent ?? 0)) / 100)
  const totalOf = (memberId: string) => (rules.data ?? []).filter((r) => r.member_id === memberId).reduce((n, r) => n + amountOf(r), 0)
  const grand = people.reduce((n, p) => n + totalOf(p.id), 0)
  // Receita do mês: tudo que foi pago em cobranças; cada grupo mostra quanto leva dela.
  const revenue = (paid.data ?? []).reduce((n, c) => n + Number(c.final_amount), 0)

  const targetName = (r: Rule) => r.scope === 'section' ? sections.data?.find((s) => s.id === r.section_id)?.name
    : instruments.data?.find((i) => i.id === r.instrument_id)?.name
  const summaryOf = (r: Rule) => {
    if (r.kind === 'fixed') return `${formatCurrency(Number(r.fixed_amount ?? 0))} fixo por mês`
    if (r.kind === 'hourly') return `${formatCurrency(Number(r.hourly_rate ?? 0))} por hora de aula${r.scope === 'section' ? ` · oficinas de ${targetName(r) ?? ''}` : ''}`
    const of = r.scope === 'all' ? 'da receita total das oficinas' : r.scope === 'section' ? `da receita do naipe ${targetName(r) ?? ''}` : `da receita do instrumento ${targetName(r) ?? ''}`
    return `${num(Number(r.percent ?? 0))}% ${of}`
  }
  const detailOf = (r: Rule) => r.kind === 'hourly'
    ? `${lessonsOf(r).length} aula(s) · ${num(hoursFor(r))} h no mês · rende ${formatCurrency(amountOf(r))}`
    : r.kind === 'percent' ? `Receita recebida no mês ${formatCurrency(revenueOf(r))} · rende ${formatCurrency(amountOf(r))}` : `rende ${formatCurrency(amountOf(r))}`

  const generate = useMutation({
    mutationFn: async () => {
      const already = new Set((payments.data ?? []).map((p) => p.member_id))
      const todo = people.filter((p) => !already.has(p.id) && totalOf(p.id) > 0)
      for (const p of todo) {
        const { error } = await supabase.rpc('create_staff_payment', { p_member: p.id, p_competence: competence, p_destination: null, p_amount: totalOf(p.id), p_due_on: null, p_notes: 'Gerado pela Equipe' })
        if (error) throw error
      }
      return todo.length
    },
    onSuccess: (n) => { toast.success(n ? `${n} pagamento(s) criado(s).` : 'Nenhum pagamento novo a criar.'); qc.invalidateQueries({ queryKey: ['staff-payments'] }); qc.invalidateQueries({ queryKey: ['staff-payments-month', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const addExtra = async (id: string) => {
    if (!id) return
    const { data } = await supabase.from('members').select('id, full_name, display_name').eq('id', id).maybeSingle()
    if (data) setExtra((x) => [...x, { id, name: shortName(data.full_name, data.display_name), kinds: [] }])
    setDrafts((d) => ({ ...d, [id]: [...(d[id] ?? []), Date.now()] }))
  }

  const card = (p: Person) => {
    const mine = (rules.data ?? []).filter((r) => r.member_id === p.id)
    return (
      <Card key={p.id} className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold"><MemberLink id={p.id}>{p.name}</MemberLink> {p.kinds.map((k) => <Badge key={k} className="ml-1">{k}</Badge>)}</p>
          <p className="font-display text-lg font-bold">{formatCurrency(totalOf(p.id))} <span className="text-sm font-normal text-muted-foreground">previsto no mês</span></p>
        </div>
        {mine.map((r) => <RuleLine key={r.id} rule={r} memberId={p.id} cycleId={cycleId} canEdit={canEdit} summary={summaryOf(r)} detail={detailOf(r)} />)}
        {(drafts[p.id] ?? []).map((k) => (
          <RuleEditor key={k} rule={EMPTY_RULE} memberId={p.id} cycleId={cycleId} canEdit={canEdit} onDone={() => setDrafts((d) => ({ ...d, [p.id]: (d[p.id] ?? []).filter((x) => x !== k) }))} />
        ))}
        {canEdit && <Button size="sm" variant="outline" aria-label="Nova regra" title="Nova regra" onClick={() => setDrafts((d) => ({ ...d, [p.id]: [...(d[p.id] ?? []), Date.now()] }))}><Plus className="h-4 w-4" /> Regra</Button>}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Equipe</h1>
        <div className="flex flex-wrap items-center gap-2"><MonthNav value={ym} onChange={setYm} /></div>
      </div>
      <ReadMore>
        Quem recebe no ciclo {cycle?.name ?? ''} e como: valor fixo, porcentagem ou valor por hora de aula. A porcentagem incide sobre a receita recebida no mês (cobranças pagas)
        de todas as oficinas, de um naipe ou de um instrumento. No pagamento por hora, só contam as aulas que não foram canceladas. Os valores podem mudar de um ciclo para o seguinte.
      </ReadMore>
      {(rules.isLoading || staff.isLoading) && <Skeleton className="h-24" />}
      {!rules.isLoading && people.length === 0 && <EmptyState>Ninguém na equipe deste ciclo ainda. Marque a participação como remunerada na ficha da pessoa, ou adicione alguém abaixo.</EmptyState>}
      {GROUPS.map((g) => {
        const list = people.filter((p) => groupOf(p) === g.key)
        if (list.length === 0) return null
        const open = openGroups.has(g.label)
        const total = list.reduce((n, p) => n + totalOf(p.id), 0)
        const pct = revenue > 0 ? Math.round((total / revenue) * 1000) / 10 : 0
        return (
          <section key={g.label} className="rounded-lg border border-border">
            <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 p-2.5 text-left"
              onClick={() => setOpenGroups((s) => { const n = new Set(s); if (n.has(g.label)) n.delete(g.label); else n.add(g.label); return n })}>
              <ChevronRight className={cn('h-5 w-5 shrink-0 transition-transform', open && 'rotate-90')} />
              <span className="font-display text-lg font-bold">{g.label}</span>
              <span className="min-w-0 flex-1 text-right text-muted-foreground">{formatCurrency(total)} / {formatCurrency(revenue)} ({num(pct)}%)</span>
            </button>
            {open && <div className="space-y-2 p-2 pt-0">{list.map(card)}</div>}
          </section>
        )
      })}
      {canEdit && (
        <Card className="space-y-2 p-3">
          <h3>Adicionar pessoa à equipe do ciclo</h3>
          <MemberPicker value="" onlyActive onChange={(id) => void addExtra(id)} />
        </Card>
      )}
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="font-semibold">Total previsto no mês: {formatCurrency(grand)}</p>
        {canEdit && <Button disabled={generate.isPending || grand <= 0} onClick={() => generate.mutate()}>Gerar pagamentos do mês</Button>}
      </Card>
      <div className="space-y-2">
        <h2>Pagamentos</h2>
        <StaffTab competence={competence} />
      </div>
    </div>
  )
}
