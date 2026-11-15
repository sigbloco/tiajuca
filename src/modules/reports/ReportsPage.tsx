import { ProgressiveList } from '@/components/shared/LoadMore'
import { MemberLink } from '@/modules/members/MemberLink'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { DateInput } from '@/components/ui/masked-inputs'
import { Card, EmptyState, Input, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { addDaysIso, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'

type Group = 'member' | 'instrument' | 'section' | 'month' | 'activity'
const GROUPS: { key: Group; label: string }[] = [
  { key: 'member', label: 'Por integrante' }, { key: 'instrument', label: 'Por instrumento' }, { key: 'section', label: 'Por naipe' },
  { key: 'month', label: 'Por mês' }, { key: 'activity', label: 'Por atividade' },
]
interface Row { group_id: string | null; label: string; sort_key: string; records: number; present: number; pct: number }
interface Sec { id: string; name: string }
interface Ins { id: string; name: string; section_id: string }

/** Meses (AAAA-MM) cobertos pelo período. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const end = to.slice(0, 7)
  while (out.length < 60) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key > end) break
    out.push(key)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}
const monthLabel = (k: string) => `${k.slice(5)}/${k.slice(0, 4)}`
const pctColor = (p: number) => (p < 60 ? 'text-destructive' : p < 80 ? 'text-warning' : 'text-success')

/** Relatórios de presença no escopo de quem consulta (direção = todos; Professor/Monitor = seu grupo). */
export function ReportsPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const { cycle } = useSelectedCycle()
  const [from, setFrom] = useState(cycle?.starts_on ?? addDaysIso(today, -90))
  const [to, setTo] = useState(cycle?.ends_on ?? today)
  // Trocar o ciclo preenche De/Até com o início e o fim dele; dá para ajustar depois.
  useEffect(() => { if (cycle) { setFrom(cycle.starts_on); setTo(cycle.ends_on) } }, [cycle?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [group, setGroup] = useState<Group>('member')
  // Recorte combinável com o agrupamento: '' (tudo), 'sec:<id>', 'ins:<id>' ou 'mon:AAAA-MM'.
  const [cut, setCut] = useState('')
  const [order, setOrder] = useState<'pct-asc' | 'pct-desc' | 'name'>('pct-asc')
  const valid = Boolean(from && to && from <= to)

  const catalog = useQuery({
    queryKey: ['report-catalog', orgId],
    queryFn: async () => {
      const [s, i] = await Promise.all([
        supabase.from('sections').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name'),
        supabase.from('instruments').select('id, name, section_id').eq('organization_id', orgId).eq('is_active', true).order('name').limit(1000),
      ])
      if (s.error) throw s.error
      if (i.error) throw i.error
      return { sections: (s.data ?? []) as Sec[], instruments: (i.data ?? []) as Ins[] }
    },
  })
  const sections = catalog.data?.sections ?? []
  const instruments = catalog.data?.instruments ?? []
  const months = useMemo(() => (valid ? monthsBetween(from, to) : []), [valid, from, to])
  // Se o período mudou e o mês escolhido saiu dele, volta para "todos".
  useEffect(() => { if (cut.startsWith('mon:') && !months.includes(cut.slice(4))) setCut('') }, [months, cut])

  const report = useQuery({
    queryKey: ['report', orgId, from, to, group, cut],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_report_f', {
        p_org: orgId, p_from: from, p_to: to, p_group: group,
        p_section: cut.startsWith('sec:') ? cut.slice(4) : null,
        p_instrument: cut.startsWith('ins:') ? cut.slice(4) : null,
        p_month: cut.startsWith('mon:') ? cut.slice(4) : null,
      })
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  const rows = [...(report.data ?? [])].sort((a, b) =>
    order === 'name' || group === 'month' || group === 'activity' ? a.sort_key.localeCompare(b.sort_key)
      : order === 'pct-asc' ? Number(a.pct) - Number(b.pct) : Number(b.pct) - Number(a.pct))
  const totals = rows.reduce((t, r) => ({ rec: t.rec + Number(r.records), pres: t.pres + Number(r.present) }), { rec: 0, pres: 0 })

  // Filtro "Integrantes com presença maior/menor que X% em naipe Y, instrumento Z".
  const [cmp, setCmp] = useState<'lt' | 'gt'>('lt')
  const [limit, setLimit] = useState('75')
  const [fSec, setFSec] = useState('')
  const [fIns, setFIns] = useState('')
  const insOptions = instruments.filter((i) => !fSec || i.section_id === fSec)
  const limitNum = Number(limit)
  const limitOk = limit.trim() !== '' && Number.isFinite(limitNum)
  const people = useQuery({
    queryKey: ['report-people', orgId, from, to, fSec, fIns],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_report_f', { p_org: orgId, p_from: from, p_to: to, p_group: 'member', p_section: fSec || null, p_instrument: fIns || null, p_month: null })
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })
  const matched = (people.data ?? [])
    .filter((r) => limitOk && (cmp === 'lt' ? Number(r.pct) < limitNum : Number(r.pct) > limitNum))
    .sort((a, b) => (cmp === 'lt' ? Number(a.pct) - Number(b.pct) : Number(b.pct) - Number(a.pct)))

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="r-from">De</Label><DateInput id="r-from" value={from} onChange={setFrom} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-to">Até</Label><DateInput id="r-to" min={from || undefined} value={to} onChange={setTo} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-ord">Ordenar</Label>
            <Select id="r-ord" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
              <option value="pct-asc">Menor presença primeiro</option><option value="pct-desc">Maior presença primeiro</option><option value="name">Nome / data</option>
            </Select></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="r-group">Agrupar</Label>
            <Select id="r-group" value={group} onChange={(e) => setGroup(e.target.value as Group)}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</Select></div>
          <div className="space-y-1.5"><Label htmlFor="r-cut">Filtrar</Label>
            <Select id="r-cut" value={cut} onChange={(e) => setCut(e.target.value)}>
              <option value="">Todos</option>
              {sections.length > 0 && <optgroup label="Naipe">{sections.map((s) => <option key={s.id} value={`sec:${s.id}`}>{s.name}</option>)}</optgroup>}
              {instruments.length > 0 && <optgroup label="Instrumento">{instruments.map((i) => <option key={i.id} value={`ins:${i.id}`}>{i.name}</option>)}</optgroup>}
              {months.length > 0 && <optgroup label="Mês">{months.map((m) => <option key={m} value={`mon:${m}`}>{monthLabel(m)}</option>)}</optgroup>}
            </Select></div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{totals.rec ? `${totals.pres} presenças em ${totals.rec} registros (${Math.round((100 * totals.pres) / totals.rec)}%)` : ' '}</p>
      </div>

      {!valid && <EmptyState>Informe um período válido.</EmptyState>}
      {report.isLoading && valid && <Skeleton className="h-32" />}
      {report.isError && <Card className="p-3 text-destructive">{friendlyError(report.error)}</Card>}
      {report.data && rows.length === 0 && <EmptyState>Sem registros de presença neste período.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={rows} render={(r) => (
          <Card key={`${r.group_id}-${r.label}`} className="space-y-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="break-words font-semibold">{group === 'member' && r.group_id ? <MemberLink id={r.group_id}>{r.label}</MemberLink> : r.label}</p>
              <span className={cn('font-display text-lg font-bold', pctColor(Number(r.pct)))}>{Number(r.pct).toLocaleString('pt-BR')}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', Number(r.pct) < 60 ? 'bg-destructive' : Number(r.pct) < 80 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, Number(r.pct))}%` }} /></div>
            <p className="text-xs text-muted-foreground">{r.present} presenças em {r.records} registros</p>
          </Card>
        )} />
      </div>

      <section className="space-y-2">
        <h2>Integrantes por presença</h2>
        <Card className="space-y-2 p-3">
          <p className="text-sm text-muted-foreground">Integrantes com presença maior ou menor que um percentual, no período acima.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1.5"><Label htmlFor="p-cmp">Presença</Label>
              <Select id="p-cmp" value={cmp} onChange={(e) => setCmp(e.target.value as 'lt' | 'gt')}><option value="lt">Menor que</option><option value="gt">Maior que</option></Select></div>
            <div className="space-y-1.5"><Label htmlFor="p-pct">Percentual (%) <span className="text-destructive">*</span></Label>
              <Input id="p-pct" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} /></div>
            <div className="space-y-1.5"><Label htmlFor="p-sec">Naipe</Label>
              <Select id="p-sec" value={fSec} onChange={(e) => { setFSec(e.target.value); setFIns('') }}>
                <option value="">Todos</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
            <div className="space-y-1.5"><Label htmlFor="p-ins">Instrumento</Label>
              <Select id="p-ins" value={fIns} onChange={(e) => setFIns(e.target.value)}>
                <option value="">Todos</option>{insOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></div>
          </div>
        </Card>
        {!limitOk && <EmptyState>Informe o percentual.</EmptyState>}
        {limitOk && people.data && matched.length === 0 && <EmptyState>Ninguém nesse critério.</EmptyState>}
        {limitOk && matched.length > 0 && <p className="text-sm text-muted-foreground">{matched.length} {matched.length === 1 ? 'integrante' : 'integrantes'}</p>}
        <ProgressiveList items={limitOk ? matched : []} render={(r) => (
          <Card key={r.group_id} className="flex items-center justify-between gap-2 p-3">
            <span className="break-words font-semibold">{r.group_id ? <MemberLink id={r.group_id}>{r.label}</MemberLink> : r.label}</span>
            <span className={cn('font-display text-lg font-bold', pctColor(Number(r.pct)))}>{Number(r.pct).toLocaleString('pt-BR')}%</span>
          </Card>
        )} />
      </section>
    </div>
  )
}
