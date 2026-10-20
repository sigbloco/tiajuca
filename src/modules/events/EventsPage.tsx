import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Select, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCompetence, formatDayLong, formatTime, monthGridDays, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { useCycles } from '@/modules/cycles/service'
import { CyclesPage } from '@/modules/cycles/CyclesPage'
import { HolidaysSettings } from '@/modules/billing/BillingSettings'
import { CatalogEditor, useCatalog } from '@/modules/structure/CatalogEditor'
import { EventSheet } from './EventSheet'
import { RecurrencesSettings } from './RecurrencesSettings'
import { COLOR_BADGE, COLOR_DOT, STATUS_LABEL, listActivities, materialize, type Activity } from './service'

const WEEK_HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function EventsPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const tz = membership?.timezone
  const canManage = usePermission('events.manage')
  const today = todayIso(tz)

  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [cycleId, setCycleId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ activity: Activity | null } | null>(null)
  const [tab, setTab] = useState<'agenda' | 'recorrencias' | 'tipos' | 'feriados' | 'ciclos'>('agenda')
  const cycles = useCycles()
  const types = useCatalog('activity_types')

  const days = useMemo(() => monthGridDays(ym.y, ym.m), [ym])
  const from = days[0].iso
  const to = days[days.length - 1].iso

  // Direção: garante as ocorrências das recorrências (idempotente) para as próximas 12 semanas.
  const gen = useMutation({
    mutationFn: () => materialize(orgId, addDaysIso(today, 84)),
    onSuccess: (n) => { if (n > 0) qc.invalidateQueries({ queryKey: ['activities', orgId] }) },
  })
  useEffect(() => { if (canManage) gen.mutate() }, [canManage, orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, from, to, cycleId, typeId],
    placeholderData: keepPreviousData,
    queryFn: () => listActivities({ orgId, from, to, cycleId: cycleId || undefined, typeId: typeId || undefined }),
  })

  const byDay = useMemo(() => {
    const map: Record<string, Activity[]> = {}
    for (const a of data ?? []) (map[a.activity_date] ??= []).push(a)
    return map
  }, [data])

  const monthPrefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`
  const listDays = Object.keys(byDay).filter((d) => d.startsWith(monthPrefix) && (!selectedDay || d === selectedDay)).sort()
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + delta, 1))
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
    setSelectedDay(null)
  }

  // Recorrências (ensaios e aulas que se repetem) ficam dentro do Calendário, só para quem gerencia eventos.
  const tabs = canManage && (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
      {([['agenda', 'Agenda'], ['recorrencias', 'Recorrências'], ['tipos', 'Tipos de evento'], ['feriados', 'Feriados'], ['ciclos', 'Ciclos']] as const).map(([k, label]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={cn('shrink-0 rounded-full px-4 py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>{label}</button>
      ))}
    </div>
  )
  if (tab !== 'agenda' && canManage) {
    return (
      <div className="space-y-4"><h1>Calendário</h1>{tabs}
        {tab === 'recorrencias' && <RecurrencesSettings />}
        {tab === 'tipos' && <CatalogEditor table="activity_types" title="Tipos de evento" singular="Tipo" withColor canEdit={canManage} hint="Cada tipo tem uma cor no calendário." />}
        {tab === 'feriados' && <HolidaysSettings />}
        {tab === 'ciclos' && <CyclesPage />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Calendário</h1>
        {canManage && <Button onClick={() => setSheet({ activity: null })}><Plus className="h-4 w-4" /> Novo evento</Button>}
      </div>

      {tabs}

      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Select aria-label="Filtrar por ciclo" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          <option value="">Todos os ciclos</option>
          {cycles.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por tipo" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Todos os tipos</option>
          {types.data?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button size="icon" variant="ghost" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></Button>
          <p className="font-display text-lg font-bold">{formatCompetence(monthPrefix)}</p>
          <Button size="icon" variant="ghost" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">
          {WEEK_HEAD.map((d, i) => <div key={i} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, di) => {
            const list = byDay[d.iso] ?? []
            return (
              <button
                key={d.iso}
                onClick={() => setSelectedDay(selectedDay === d.iso ? null : d.iso)}
                className={cn(
                  'flex h-14 flex-col items-center rounded-lg p-1 hover:bg-muted',
                  Math.floor(di / 7) % 2 === 1 ? 'bg-muted/60' : 'bg-card',
                  !d.inMonth && 'opacity-40',
                  d.iso === today && 'ring-2 ring-primary',
                  selectedDay === d.iso && 'bg-muted',
                )}
                aria-label={`${formatDayLong(d.iso)}${list.length ? `, ${list.length} evento(s)` : ''}`}
              >
                <span className="text-sm font-semibold">{Number(d.iso.slice(8))}</span>
                <span className="mt-1 flex flex-wrap justify-center gap-0.5">
                  {list.slice(0, 4).map((a) => (
                    <span key={a.id} className={cn('h-1.5 w-1.5 rounded-full', COLOR_DOT[a.activity_types?.color ?? 'muted'], a.status === 'cancelled' && 'opacity-30')} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {isLoading && <Skeleton className="h-24" />}
      {data && listDays.length === 0 && <EmptyState>Nenhum evento {selectedDay ? 'neste dia' : 'neste mês'}.</EmptyState>}
      <div className="space-y-4">
        {listDays.map((day) => (
          <section key={day} className="space-y-2">
            <h3 className="capitalize">{formatDayLong(day)}</h3>
            {byDay[day].map((a, ai) => {
              const t = a.activity_types
              const time = [formatTime(a.start_time), formatTime(a.end_time)].filter(Boolean).join(' – ')
              return (
                <Card key={a.id} className={cn('flex items-center gap-3 p-3', ai % 2 === 1 && 'bg-muted/50', a.status === 'cancelled' && 'opacity-60')}>
                  <span className={cn('h-10 w-1.5 shrink-0 rounded-full', COLOR_DOT[t?.color ?? 'muted'])} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ activity: a })}>
                    <p className={cn('truncate font-semibold', a.status === 'cancelled' && 'line-through')}>{a.title}</p>
                    <p className="truncate text-muted-foreground">{[time, a.location].filter(Boolean).join(' · ') || 'Horário a definir'}</p>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    {t && <Badge className={COLOR_BADGE[t.color]}>{t.name}</Badge>}
                    {a.status !== 'scheduled' && <Badge>{STATUS_LABEL[a.status]}</Badge>}
                  </div>
                </Card>
              )
            })}
          </section>
        ))}
      </div>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <EventSheet key={sheet.activity?.id ?? 'new'} activity={sheet.activity} defaultDate={selectedDay ?? today} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
