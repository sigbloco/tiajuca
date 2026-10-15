import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { DateInput } from '@/components/ui/masked-inputs'
import { Button, Card, EmptyState, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { addDaysIso, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

type Group = 'member' | 'instrument' | 'section' | 'cycle' | 'month' | 'activity'
const GROUPS: { key: Group; label: string }[] = [
  { key: 'member', label: 'Por integrante' }, { key: 'instrument', label: 'Por instrumento' }, { key: 'section', label: 'Por naipe' },
  { key: 'cycle', label: 'Por ciclo' }, { key: 'month', label: 'Por mês' }, { key: 'activity', label: 'Por atividade' },
]
interface Row { group_id: string | null; label: string; sort_key: string; records: number; present: number; pct: number }
interface Streak { member_id: string; display_name: string; streak: number }

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

/** Relatórios de presença no escopo de quem consulta (Direção = todos; Professor/Monitor = seu grupo). */
export function ReportsPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const [from, setFrom] = useState(addDaysIso(today, -90))
  const [to, setTo] = useState(today)
  const [group, setGroup] = useState<Group>('member')
  const [order, setOrder] = useState<'pct-asc' | 'pct-desc' | 'name'>('pct-asc')
  const [minStreak, setMinStreak] = useState('3')
  const valid = Boolean(from && to && from <= to)

  const report = useQuery({
    queryKey: ['report', orgId, from, to, group],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_report', { p_org: orgId, p_from: from, p_to: to, p_group: group })
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })
  const streaks = useQuery({
    queryKey: ['streaks', orgId, minStreak],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('absence_streaks', { p_org: orgId, p_min: Number(minStreak) })
      if (error) throw error
      return (data ?? []) as Streak[]
    },
  })

  const rows = [...(report.data ?? [])].sort((a, b) =>
    order === 'name' || group === 'month' || group === 'activity' ? a.sort_key.localeCompare(b.sort_key)
      : order === 'pct-asc' ? Number(a.pct) - Number(b.pct) : Number(b.pct) - Number(a.pct))
  const totals = rows.reduce((t, r) => ({ rec: t.rec + Number(r.records), pres: t.pres + Number(r.present) }), { rec: 0, pres: 0 })

  const download = () => {
    const header = ['Grupo', 'Registros', 'Presentes', '% presença']
    const lines = [header, ...rows.map((r) => [r.label, r.records, r.present, String(r.pct).replace('.', ',')])]
    const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `presenca-${group}-${from}-a-${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <h1>Relatórios de presença</h1>
      <Card className="grid gap-2 p-3 sm:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="r-from">De</Label><DateInput id="r-from" value={from} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label htmlFor="r-to">Até</Label><DateInput id="r-to" min={from || undefined} value={to} onChange={setTo} /></div>
        <div className="space-y-1.5"><Label htmlFor="r-group">Agrupar</Label>
          <Select id="r-group" value={group} onChange={(e) => setGroup(e.target.value as Group)}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</Select></div>
        <div className="space-y-1.5"><Label htmlFor="r-ord">Ordenar</Label>
          <Select id="r-ord" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
            <option value="pct-asc">Menor presença primeiro</option><option value="pct-desc">Maior presença primeiro</option><option value="name">Nome / data</option>
          </Select></div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{totals.rec ? `${totals.pres} presenças em ${totals.rec} registros (${Math.round((100 * totals.pres) / totals.rec)}%)` : ' '}</p>
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={download}><Download className="h-4 w-4" /> Baixar CSV</Button>
      </div>

      {!valid && <EmptyState>Informe um período válido.</EmptyState>}
      {report.isLoading && valid && <Skeleton className="h-32" />}
      {report.isError && <Card className="p-3 text-destructive">{friendlyError(report.error)}</Card>}
      {report.data && rows.length === 0 && <EmptyState>Sem registros de presença neste período.</EmptyState>}
      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={`${r.group_id}-${r.label}`} className="space-y-1.5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{r.label}</p>
              <span className={cn('font-display text-lg font-bold', Number(r.pct) < 60 ? 'text-destructive' : Number(r.pct) < 80 ? 'text-warning' : 'text-success')}>{Number(r.pct).toLocaleString('pt-BR')}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', Number(r.pct) < 60 ? 'bg-destructive' : Number(r.pct) < 80 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, Number(r.pct))}%` }} /></div>
            <p className="text-xs text-muted-foreground">{r.present} presenças em {r.records} registros</p>
          </Card>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2>Faltas consecutivas</h2>
          <Select className="w-44" aria-label="Mínimo de faltas" value={minStreak} onChange={(e) => setMinStreak(e.target.value)}>
            {['2', '3', '4', '5'].map((n) => <option key={n} value={n}>{n}+ faltas seguidas</option>)}
          </Select>
        </div>
        {streaks.data?.length === 0 && <EmptyState>Ninguém com {minStreak}+ faltas seguidas.</EmptyState>}
        {streaks.data?.map((s) => (
          <Card key={s.member_id} className="flex items-center justify-between p-3"><span className="font-semibold">{s.display_name}</span><span className="font-display text-lg font-bold text-destructive">{s.streak} faltas</span></Card>
        ))}
        <p className="text-xs text-muted-foreground">Conta eventos já realizados, do mais recente para o mais antigo, até a última presença. Ausente e justificado contam como falta de presença.</p>
      </section>
    </div>
  )
}
