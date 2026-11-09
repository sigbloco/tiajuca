import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, shortName, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { CycleSelect } from '@/modules/cycles/CycleSelect'
import { useCycles } from '@/modules/cycles/service'
import { MemberLink } from '@/modules/members/MemberLink'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { StaffTab } from './StaffTab'

type Scope = 'all' | 'section' | 'subsection' | 'instrument'
interface Rule {
  id?: string
  kind: 'fixed' | 'percent'
  fixed_amount: number | null
  percent: number | null
  scope: Scope
  section_id: string | null
  subsection_id: string | null
  instrument_id: string | null
}
interface RuleRow extends Rule { id: string; member_id: string; members: { full_name: string; display_name: string | null } | null }
interface Person { id: string; name: string; kinds: string[] }

const KIND_LABEL: Record<string, string> = { professor: 'Professor', monitor: 'Monitor(a)', regente: 'Regente' }
const SCOPE_LABEL: Record<Scope, string> = { all: 'Receita total das oficinas', section: 'Um naipe', subsection: 'Um subnaipe', instrument: 'Um instrumento' }
const EMPTY_RULE: Rule = { kind: 'percent', fixed_amount: null, percent: null, scope: 'all', section_id: null, subsection_id: null, instrument_id: null }

/** Uma regra de pagamento: fixo ou %; o % incide sobre toda a receita, um naipe, um subnaipe ou um instrumento. */
function RuleEditor({ rule, memberId, cycleId, canEdit, onDone }: { rule: Rule; memberId: string; cycleId: string; canEdit: boolean; onDone?: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const [r, setR] = useState<Rule>(rule)
  const [pct, setPct] = useState(rule.percent === null ? '' : String(rule.percent))
  const percent = Number(pct.replace(',', '.'))
  const valid = r.kind === 'fixed' ? r.fixed_amount !== null && r.fixed_amount >= 0
    : Number.isFinite(percent) && percent > 0 && percent <= 100 && (r.scope === 'all' || !!(r.scope === 'section' ? r.section_id : r.scope === 'subsection' ? r.subsection_id : r.instrument_id))
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-pay-rules', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      const row = {
        kind: r.kind, scope: r.kind === 'fixed' ? 'all' : r.scope,
        fixed_amount: r.kind === 'fixed' ? r.fixed_amount : null, percent: r.kind === 'percent' ? percent : null,
        section_id: r.kind === 'percent' && r.scope === 'section' ? r.section_id : null,
        subsection_id: r.kind === 'percent' && r.scope === 'subsection' ? r.subsection_id : null,
        instrument_id: r.kind === 'percent' && r.scope === 'instrument' ? r.instrument_id : null,
      }
      const q = rule.id ? supabase.from('staff_pay_rules').update(row).eq('id', rule.id)
        : supabase.from('staff_pay_rules').insert({ ...row, organization_id: orgId, cycle_id: cycleId, member_id: memberId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Regra salva.'); refresh(); onDone?.() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('staff_pay_rules').delete().eq('id', rule.id!); if (error) throw error },
    onSuccess: () => { notifySaved('Regra removida.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const dirty = JSON.stringify({ ...r, percent: r.kind === 'percent' ? percent : null }) !== JSON.stringify({ ...rule, percent: rule.kind === 'percent' ? rule.percent : null }) || !rule.id
  return (
    <div className="grid gap-1.5 rounded-lg bg-muted/50 p-2 sm:grid-cols-[8rem_9rem_1fr_auto] sm:items-center">
      <Select aria-label="Tipo" disabled={!canEdit} value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as Rule['kind'] })}>
        <option value="percent">Porcentagem</option><option value="fixed">Valor fixo</option>
      </Select>
      {r.kind === 'fixed'
        ? <MoneyInput value={r.fixed_amount} onChange={(v) => setR({ ...r, fixed_amount: v })} />
        : <div className="flex items-center gap-1"><Input aria-label="Porcentagem" inputMode="decimal" disabled={!canEdit} placeholder="0" value={pct} onChange={(e) => setPct(e.target.value)} /><span className="font-semibold">%</span></div>}
      {r.kind === 'percent' ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Select aria-label="Sobre" disabled={!canEdit} value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value as Scope, section_id: null, subsection_id: null, instrument_id: null })}>
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
          </Select>
          {r.scope === 'section' && (
            <Select aria-label="Naipe" disabled={!canEdit} value={r.section_id ?? ''} onChange={(e) => setR({ ...r, section_id: e.target.value || null })}>
              <option value="">Escolha o naipe</option>{(sections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {r.scope === 'subsection' && (
            <Select aria-label="Subnaipe" disabled={!canEdit} value={r.subsection_id ?? ''} onChange={(e) => setR({ ...r, subsection_id: e.target.value || null })}>
              <option value="">Escolha o subnaipe</option>{(subsections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {r.scope === 'instrument' && (
            <Select aria-label="Instrumento" disabled={!canEdit} value={r.instrument_id ?? ''} onChange={(e) => setR({ ...r, instrument_id: e.target.value || null })}>
              <option value="">Escolha o instrumento</option>{(instruments.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </div>
      ) : <span className="text-sm text-muted-foreground">Valor mensal fixo</span>}
      {canEdit && (
        <div className="flex gap-1">
          <Button size="icon" aria-label="Salvar regra" title="Salvar" disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" className="text-destructive" aria-label="Remover regra" title="Remover regra" onClick={() => { if (!rule.id) return onDone?.(); if (window.confirm('Remover esta regra de pagamento?')) del.mutate() }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}

/** Equipe: quem recebe no ciclo e como (fixo e/ou %), com o previsto do mês a partir da receita das cobranças pagas. */
export function TeamPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canEdit = usePermission('finance.manage')
  const today = todayIso(membership?.timezone)
  const [cycleId, setCycleId] = useState('')
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  const competence = toCompetence(ym)
  const cycles = useCycles()
  const cycle = (cycles.data ?? []).find((c) => c.id === cycleId)
  const [drafts, setDrafts] = useState<Record<string, number[]>>({})
  const [extra, setExtra] = useState<Person[]>([])
  const instruments = useCatalog('instruments')

  const rules = useQuery({
    queryKey: ['staff-pay-rules', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_pay_rules').select('id, member_id, kind, fixed_amount, percent, scope, section_id, subsection_id, instrument_id, members(full_name, display_name)')
        .eq('organization_id', orgId).eq('cycle_id', cycleId).order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as RuleRow[]
    },
  })
  const staff = useQuery({
    queryKey: ['staff-assignments', orgId, 'team', cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('member_id, staff_kind, members(full_name, display_name)')
        .eq('organization_id', orgId).eq('cycle_id', cycleId).is('valid_to', null).limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as { member_id: string; staff_kind: string; members: { full_name: string; display_name: string | null } | null }[]
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

  const revenueOf = useMemo(() => {
    const inst = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const byMember = new Map<string, string[]>()
    for (const p of parts.data ?? []) byMember.set(p.member_id, [...(byMember.get(p.member_id) ?? []), p.instrument_id])
    return (rule: Rule) => (paid.data ?? []).reduce((sum, c) => {
      if (rule.scope === 'all') return sum + Number(c.final_amount)
      const ids = byMember.get(c.member_id) ?? []
      const hit = ids.some((id) => {
        const i = inst.get(id)
        return !!i && (rule.scope === 'instrument' ? i.id === rule.instrument_id : rule.scope === 'section' ? i.section_id === rule.section_id : i.subsection_id === rule.subsection_id)
      })
      return hit ? sum + Number(c.final_amount) : sum
    }, 0)
  }, [paid.data, parts.data, instruments.data])
  const amountOf = (r: Rule) => (r.kind === 'fixed' ? Number(r.fixed_amount ?? 0) : Math.round(revenueOf(r) * Number(r.percent ?? 0)) / 100)
  const totalOf = (memberId: string) => (rules.data ?? []).filter((r) => r.member_id === memberId).reduce((n, r) => n + amountOf(r), 0)
  const grand = people.reduce((n, p) => n + totalOf(p.id), 0)

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Equipe</h1>
        <div className="flex flex-wrap items-center gap-2"><CycleSelect value={cycleId} onChange={setCycleId} /><MonthNav value={ym} onChange={setYm} /></div>
      </div>
      <p className="text-muted-foreground">
        Quem recebe no ciclo {cycle?.name ?? ''} e como: valor fixo e/ou porcentagem. A porcentagem incide sobre a receita recebida no mês (cobranças pagas)
        de todas as oficinas, de um naipe, de um subnaipe ou de um instrumento. Os valores podem mudar de um ciclo para o seguinte.
      </p>
      {(rules.isLoading || staff.isLoading) && <Skeleton className="h-24" />}
      {!rules.isLoading && people.length === 0 && <EmptyState>Ninguém na equipe deste ciclo ainda. Designe professores e monitores em Naipes ou adicione uma pessoa abaixo.</EmptyState>}
      <div className="space-y-2">
        {people.map((p) => {
          const mine = (rules.data ?? []).filter((r) => r.member_id === p.id)
          return (
            <Card key={p.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold"><MemberLink id={p.id}>{p.name}</MemberLink> {p.kinds.map((k) => <Badge key={k} className="ml-1">{KIND_LABEL[k] ?? k}</Badge>)}</p>
                <p className="font-display text-lg font-bold">{formatCurrency(totalOf(p.id))} <span className="text-sm font-normal text-muted-foreground">previsto no mês</span></p>
              </div>
              {mine.map((r) => (
                <div key={r.id} className="space-y-0.5">
                  <RuleEditor rule={r} memberId={p.id} cycleId={cycleId} canEdit={canEdit} />
                  <p className="pl-2 text-sm text-muted-foreground">{r.kind === 'percent' ? `Base do mês: ${formatCurrency(revenueOf(r))} · ` : ''}rende {formatCurrency(amountOf(r))}</p>
                </div>
              ))}
              {(drafts[p.id] ?? []).map((k) => (
                <RuleEditor key={k} rule={EMPTY_RULE} memberId={p.id} cycleId={cycleId} canEdit={canEdit} onDone={() => setDrafts((d) => ({ ...d, [p.id]: (d[p.id] ?? []).filter((x) => x !== k) }))} />
              ))}
              {canEdit && <Button size="sm" variant="outline" onClick={() => setDrafts((d) => ({ ...d, [p.id]: [...(d[p.id] ?? []), Date.now()] }))}><Plus className="h-4 w-4" /> Regra</Button>}
            </Card>
          )
        })}
      </div>
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
