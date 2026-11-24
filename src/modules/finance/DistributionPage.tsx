import { audienceSectionIds, getAudiencesFor } from '@/modules/events/service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { confirmBox } from '@/components/shared/DialogHost'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, shortName, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { useCycles } from '@/modules/cycles/service'
import { PageLink } from '@/components/shared/PageLink'
import { MemberLink } from '@/modules/members/MemberLink'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { type Rule, type RuleRow, type GroupRule, RuleEditor, RuleLine, GroupRuleEditor } from './DistributionRules'

interface Person { id: string; name: string; kinds: string[] }
interface Lesson { id: string; title: string; activity_date: string; start_time: string | null; end_time: string | null; status: string; activity_types: { name: string } | null }

const EMPTY_RULE: Rule = { kind: 'percent', fixed_amount: null, percent: null, hourly_rate: null, scope: 'all', section_id: null, instrument_id: null, group_key: null }
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
/** Horas de um dia de aula: a aula e a meia hora final de ensaio contam juntas (2 h), ou mais, se o evento for mais longo. */
const hoursOf = (l: Lesson) => {
  if (!l.start_time || !l.end_time) return 2 // sem horário: 2 h
  const [h1, m1] = l.start_time.split(':').map(Number), [h2, m2] = l.end_time.split(':').map(Number)
  const h = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60
  return h > 2 ? h : 2
}

const CAIXA = 'Caixa do bloco'
/** Nome do grupo no plural, para as categorias remuneradas mais comuns (as outras usam o próprio nome). */
const PLURAL: Record<string, string> = { Direção: 'Direção', Professor: 'Professores', Monitor: 'Monitores' }
type Group = { key: string; label: string; /** Grupo de uma categoria remunerada: aparece mesmo sem ninguém ainda (para definir a %). */ always?: boolean }

/** Equipe: quem recebe no ciclo e como (fixo, % ou por hora de aula), com o previsto do mês. */
export function DistributionPage() {
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const instruments = useCatalog('instruments')
  const sections = useCatalog('sections')

  const rules = useQuery({
    queryKey: ['staff-pay-rules', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_pay_rules').select('id, member_id, kind, fixed_amount, percent, hourly_rate, scope, section_id, instrument_id, group_key, members!inner(full_name, display_name)').is('members.archived_at', null)
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
      const sel = 'member_id, artistic_functions(name), members!inner(full_name, display_name)'
      type R = { member_id: string; artistic_functions: { name: string } | null; members: { full_name: string; display_name: string | null } | null }
      let rows: R[]
      if (cycle!.is_current) {
        const { data, error } = await supabase.from('member_artistic_links').select(sel).eq('organization_id', orgId).eq('is_paid', true).not('function_id', 'is', null).is('ended_at', null).is('members.archived_at', null).limit(3000)
        if (error) throw error
        rows = (data ?? []) as unknown as R[]
      } else {
        const { data, error } = await supabase.from('cycle_participations').select(sel).eq('organization_id', orgId).eq('cycle_id', cycleId).eq('is_paid', true).not('function_id', 'is', null).is('members.archived_at', null).limit(3000)
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
        .eq('organization_id', orgId).gte('activity_date', competence).lte('activity_date', last).neq('status', 'cancelled').is('deleted_at', null).limit(2000)
      if (error) throw error
      return ((data ?? []) as unknown as Lesson[]).filter((l) => l.activity_types?.name === 'Oficina')
    },
  })
  const groupRules = useQuery({
    queryKey: ['staff-group-rules', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_group_rules').select('id, group_key, percent, scope, section_id').eq('organization_id', orgId).eq('cycle_id', cycleId)
      if (error) throw error
      return ((data ?? []) as GroupRule[]).map((r) => ({ ...r, percent: Number(r.percent) }))
    },
  })
  const hoursOverride = useQuery({
    queryKey: ['staff-pay-hours', orgId, competence],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_pay_hours').select('rule_id, hours').eq('organization_id', orgId).eq('competence', competence)
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.rule_id as string, Number(r.hours)]))
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
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [staff.data, rules.data])
  // Cada categoria remunerada (Organização → Categorias) é um grupo, criado sozinho.
  const funcs = useCatalog('artistic_functions')
  const GROUPS: Group[] = [
    ...(funcs.data ?? []).filter((f) => f.is_active && f.kind === 'paid').sort((a, b) => a.sort_order - b.sort_order).map((f) => ({ key: f.name, label: PLURAL[f.name] ?? f.name, always: true })),
    { key: '', label: 'Outros' },
  ]
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
  /** Aulas do mês que entram na regra por hora (todas as oficinas ou as do público de um naipe). */
  // Aula com público definido conta para o naipe do público; sem público, não conta para o naipe.
  const lessonAudiences = useQuery({ queryKey: ['audiences-lessons', orgId, competence, (lessons.data ?? []).length], enabled: (lessons.data?.length ?? 0) > 0, queryFn: () => getAudiencesFor((lessons.data ?? []).map((l) => l.id)) })
  const lessonsOf = (rule: Rule) => {
    const instSection = new Map((instruments.data ?? []).map((i) => [i.id, i.section_id as string]))
    return (lessons.data ?? []).filter((l) => {
      if (rule.scope !== 'section') return true
      const aud = lessonAudiences.data?.get(l.id)
      if (aud && aud.length > 0) return audienceSectionIds(aud, instSection).has(rule.section_id as string)
      return false
    })
  }
  // Por dia de aula: duas oficinas no mesmo dia (sopro e percussão ao mesmo tempo) contam uma vez.
  const daysOf = (rule: Rule) => { const m = new Map<string, number>(); for (const l of lessonsOf(rule)) m.set(l.activity_date, Math.max(m.get(l.activity_date) ?? 0, hoursOf(l))); return m }
  const autoHoursFor = (rule: Rule) => [...daysOf(rule).values()].reduce((n, h) => n + h, 0)
  const hoursFor = (rule: Rule) => (rule.id ? hoursOverride.data?.get(rule.id) : undefined) ?? autoHoursFor(rule)
  const amountOf = (r: Rule) => (r.kind === 'fixed' ? Number(r.fixed_amount ?? 0)
    : r.kind === 'hourly' ? Math.round(hoursFor(r) * Number(r.hourly_rate ?? 0) * 100) / 100
      : r.kind === 'group' ? 0 // a divisão do grupo é calculada à parte (groupShareOf)
        : Math.round(revenueOf(r) * Number(r.percent ?? 0)) / 100)
  const individualOf = (memberId: string) => (rules.data ?? []).filter((r) => r.member_id === memberId && r.kind !== 'group').reduce((n, r) => n + amountOf(r), 0)
  // Receita do mês: tudo que os contribuintes pagaram em cobranças.
  const revenue = (paid.data ?? []).reduce((n, c) => n + Number(c.final_amount), 0)
  const cents = (n: number) => Math.round(n * 100) / 100
  // Ordem: 1) hora-aula (e fixo) tabelados; 2) % exclusivas; 3) caixa do bloco, sobre o que resta; 4) o que sobra é dividido entre os grupos, igualmente entre as pessoas.
  // Uma coisa não anula a outra: a pessoa recebe tudo o que lhe cabe.
  const totalIndividual = people.reduce((n, p) => n + individualOf(p.id), 0)
  const allRules = rules.data ?? []
  const hourFixedTotal = allRules.filter((r) => r.kind === 'hourly' || r.kind === 'fixed').reduce((n, r) => n + amountOf(r), 0)
  const exclusiveTotal = allRules.filter((r) => r.kind === 'percent').reduce((n, r) => n + amountOf(r), 0)
  const caixaPct = (groupRules.data ?? []).find((g) => g.group_key === CAIXA)?.percent ?? 0
  const rawNet = revenue - totalIndividual
  const net = Math.max(0, rawNet)
  const caixaAmount = cents(net * caixaPct / 100)
  const pool = net - caixaAmount
  const naipeBase = (sectionId: string | null) => Math.max(0, revenueOf({ ...EMPTY_RULE, scope: 'section', section_id: sectionId }) - allRules.filter((r) => r.kind !== 'group' && r.scope === 'section' && r.section_id === sectionId).reduce((n, r) => n + amountOf(r), 0)) * (1 - caixaPct / 100)
  const sectionShares = (groupRules.data ?? []).filter((g) => g.group_key !== CAIXA && g.scope === 'section').reduce((n, g) => n + cents(naipeBase(g.section_id) * g.percent / 100), 0)
  const allPool = Math.max(0, pool - sectionShares)
  const shareOfGroup = (g: GroupRule) => cents((g.scope === 'section' ? naipeBase(g.section_id) : allPool) * g.percent / 100)
  const groupsTotal = (groupRules.data ?? []).filter((g) => g.group_key !== CAIXA).reduce((n, g) => n + shareOfGroup(g), 0)
  const notDistributed = cents(pool - groupsTotal)
  // Quanto o previsto passa do que entrou: hora-aula, fixos, % exclusivas, caixa e grupos somados contra as mensalidades pagas.
  const shortfall = Math.max(0, cents(hourFixedTotal + exclusiveTotal + caixaAmount + groupsTotal - revenue))
  // Só participa da divisão do grupo quem tem a regra "Divisão do grupo".
  const membersOfGroup = (key: string) => people.filter((p) => allRules.some((r) => r.member_id === p.id && r.kind === 'group' && r.group_key === key))
  const groupShareOf = (memberId: string) => (groupRules.data ?? []).reduce((n, g) => {
    const mem = membersOfGroup(g.group_key)
    return mem.some((m) => m.id === memberId) ? n + cents(shareOfGroup(g) / mem.length) : n
  }, 0)
  const totalOf = (memberId: string) => cents(individualOf(memberId) + groupShareOf(memberId))
  const grand = people.reduce((n, p) => n + totalOf(p.id), 0)

  const targetName = (r: Rule) => r.scope === 'section' ? sections.data?.find((s) => s.id === r.section_id)?.name
    : instruments.data?.find((i) => i.id === r.instrument_id)?.name
  const summaryOf = (r: Rule) => {
    if (r.kind === 'fixed') return `${formatCurrency(Number(r.fixed_amount ?? 0))} fixo por mês`
    if (r.kind === 'group') return `Divisão do grupo ${r.group_key ?? ''}`
    if (r.kind === 'hourly') return `${formatCurrency(Number(r.hourly_rate ?? 0))} por hora de aula${r.scope === 'section' ? ` · oficinas de ${targetName(r) ?? ''}` : ''}`
    const of = r.scope === 'all' ? 'das mensalidades dos contribuintes' : r.scope === 'section' ? `das mensalidades do naipe ${targetName(r) ?? ''}` : `das mensalidades do instrumento ${targetName(r) ?? ''}`
    return `${num(Number(r.percent ?? 0))}% ${of}`
  }
  const detailOf = (r: Rule) => r.kind === 'hourly'
    ? `${daysOf(r).size} dia(s) de aula no mês · rende ${formatCurrency(amountOf(r))}`
    : r.kind === 'group' ? `rende ${formatCurrency(groupShareOf((r as RuleRow).member_id))}`
    : r.kind === 'percent' ? `Mensalidades pagas no mês: ${formatCurrency(revenueOf(r))} · rende ${formatCurrency(amountOf(r))}` : `rende ${formatCurrency(amountOf(r))}`

  const toGenerate = () => {
    const already = new Set((payments.data ?? []).map((p) => p.member_id))
    return people.filter((p) => !already.has(p.id) && totalOf(p.id) > 0)
  }
  const confirmGenerate = async () => {
    const todo = toGenerate()
    if (!todo.length) { toast.success('Nenhum pagamento novo a criar.'); return }
    const sum = todo.reduce((n, p) => n + totalOf(p.id), 0)
    const deficit = shortfall > 0 ? `\nAtenção: o previsto passa das mensalidades pagas no mês em ${formatCurrency(shortfall)}.` : ''
    if (await confirmBox({ title: 'Gerar pagamentos do mês', message: `Criar ${todo.length} ${todo.length === 1 ? 'pagamento' : 'pagamentos'} da equipe, somando ${formatCurrency(sum)}?${deficit}`, confirmLabel: 'Gerar pagamentos' })) generate.mutate()
  }
  const generate = useMutation({
    mutationFn: async () => {
      const todo = toGenerate()
      for (const p of todo) {
        const { error } = await supabase.rpc('create_staff_payment', { p_member: p.id, p_competence: competence, p_destination: null, p_amount: totalOf(p.id), p_due_on: null, p_notes: 'Gerado pela Equipe' })
        if (error) throw error
      }
      return todo.length
    },
    onSuccess: (n) => { toast.success(n ? `${n} pagamento(s) criado(s).` : 'Nenhum pagamento novo a criar.'); qc.invalidateQueries({ queryKey: ['staff-payments'] }); qc.invalidateQueries({ queryKey: ['staff-payments-month', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  /** Divisão do grupo: uma % (do todo ou de um naipe) repartida igualmente entre as pessoas do grupo. */
  const groupRuleEditor = (key: string, count: number) => {
    const gr = (groupRules.data ?? []).find((x) => x.group_key === key)
    return <GroupRuleEditor key={`${key}-${gr?.id ?? 'novo'}-${gr?.percent ?? ''}-${gr?.section_id ?? ''}`} groupKey={key} rule={gr} cycleId={cycleId} canEdit={canEdit} count={count} total={gr ? shareOfGroup(gr) : 0} />
  }

  const groupKeysOf = (p: Person) => GROUPS.filter((g) => g.key && p.kinds.includes(g.key)).map((g) => g.key)
  const card = (p: Person) => {
    const mine = (rules.data ?? []).filter((r) => r.member_id === p.id)
    return (
      <Card key={p.id} className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold"><MemberLink id={p.id}>{p.name}</MemberLink> {p.kinds.map((k) => <Badge key={k} className="ml-1">{k}</Badge>)}</p>
          <p className="font-display text-lg font-bold">{formatCurrency(totalOf(p.id))} <span className="text-sm font-normal text-muted-foreground">previsto no mês</span></p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">Regras</span>
          {canEdit && <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Nova regra" title="Nova regra" onClick={() => setDrafts((d) => ({ ...d, [p.id]: [...(d[p.id] ?? []), Date.now()] }))}><Plus className="h-3.5 w-3.5" /></button>}
        </div>
        {mine.length === 0 && (drafts[p.id] ?? []).length === 0 && <p className="text-sm text-muted-foreground">nenhuma</p>}
        {mine.map((r) => <RuleLine key={r.id} rule={r} memberId={p.id} cycleId={cycleId} canEdit={canEdit} summary={summaryOf(r)} detail={detailOf(r)} groupKeys={groupKeysOf(p)} hours={r.kind === 'hourly' ? { auto: autoHoursFor(r), value: hoursFor(r), competence } : undefined} />)}
        {(drafts[p.id] ?? []).map((k) => (
          <RuleEditor key={k} rule={EMPTY_RULE} memberId={p.id} groupKeys={groupKeysOf(p)} haveGroups={mine.filter((r) => r.kind === 'group').map((r) => r.group_key ?? '')} cycleId={cycleId} canEdit={canEdit} onDone={() => setDrafts((d) => ({ ...d, [p.id]: (d[p.id] ?? []).filter((x) => x !== k) }))} />
        ))}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="flex flex-wrap items-center gap-2"><MonthNav value={ym} onChange={setYm} /></div>
      </div>
      {rawNet < 0 && <Card role="alert" className="border-destructive p-3 text-destructive">Hora-aula e % exclusivas passam das mensalidades pagas no mês ({formatCurrency(revenue)}). Caixa e divisão dos grupos ficam zerados.</Card>}
      {(rules.isLoading || staff.isLoading) && <Skeleton className="h-24" />}
      {!rules.isLoading && people.length === 0 && <EmptyState>Ninguém na equipe deste ciclo ainda. Marque a participação como remunerada na ficha da pessoa.</EmptyState>}
      {GROUPS.map((g) => {
        const list = people.filter((p) => groupOf(p) === g.key)
        if (list.length === 0 && !g.always) return null
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
            {open && <div className="space-y-2 p-2 pt-0">{g.key && groupRuleEditor(g.key, membersOfGroup(g.key).length)}{list.map(card)}</div>}
          </section>
        )
      })}
      <Card className="space-y-2 p-3">
        <GroupRuleEditor key={`caixa-${(groupRules.data ?? []).find((g) => g.group_key === CAIXA)?.id ?? 'novo'}-${caixaPct}`} groupKey={CAIXA} label="Caixa do bloco" simple rule={(groupRules.data ?? []).find((g) => g.group_key === CAIXA)} cycleId={cycleId} canEdit={canEdit} count={0} total={caixaAmount} />
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Mensalidades pagas no mês</span><strong>{formatCurrency(revenue)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Hora-aula e fixos</span><strong>− {formatCurrency(hourFixedTotal)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">% exclusivas</span><strong>− {formatCurrency(exclusiveTotal)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Caixa do bloco</span><strong>− {formatCurrency(caixaAmount)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Divisão dos grupos</span><strong>− {formatCurrency(groupsTotal)}</strong></p>
          {shortfall > 0
            ? <p className="flex justify-between gap-2 text-destructive"><span className="font-semibold">Falta para cobrir (passa das mensalidades)</span><strong>{formatCurrency(shortfall)}</strong></p>
            : <p className="flex justify-between gap-2"><span className="text-muted-foreground">Não distribuído (fica no caixa)</span><strong>{formatCurrency(notDistributed)}</strong></p>}
        </div>
      </Card>
      <Card className={cn('flex flex-wrap items-center justify-between gap-2 p-3', shortfall > 0 && 'border-destructive')}>
        <div className="min-w-0">
          <p className="font-semibold">Total previsto no mês: {formatCurrency(grand)}</p>
          {shortfall > 0 && <p role="alert" className="text-sm font-semibold text-destructive">{formatCurrency(shortfall)} a mais do que entrou de mensalidades no mês ({formatCurrency(revenue)}).</p>}
        </div>
        {canEdit && <Button disabled={generate.isPending || grand <= 0} onClick={confirmGenerate}>Gerar pagamentos do mês</Button>}
      </Card>
      <p className="text-sm text-muted-foreground">Os pagamentos gerados aparecem em <PageLink to="pagamentos">Financeiro → Pagamentos</PageLink>.</p>
    </div>
  )
}
