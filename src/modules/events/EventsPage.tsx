import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MemberLink } from '@/modules/members/MemberLink'
import { Ban, Cake, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCompetence, formatDayLong, formatTime, monthGridDays, todayIso } from '@/core/format'
import { toast } from 'sonner'
import { friendlyError } from '@/core/errors'
import { supabase } from '@/core/supabase'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { HolidaysSettings } from '@/modules/billing/BillingSettings'
import { useMemberStatus } from '@/modules/members/useMemberStatus'
import { EventSheet } from './EventSheet'
import { RecurrencesSettings } from './RecurrencesSettings'
import { COLOR_DOT, STATUS_LABEL, cancelWord, listActivities, materialize, setActivityStatus, type Activity } from './service'

const WEEK_HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function EventsPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const tz = membership?.timezone
  const canManage = usePermission('events.manage')
  const today = todayIso(tz)

  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const { cycleId, cycle: selCycle } = useSelectedCycle()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ activity: Activity | null } | null>(null)
  const [tab, setTab] = useState<'agenda' | 'recorrencias' | 'feriados'>('agenda')

  const days = useMemo(() => monthGridDays(ym.y, ym.m), [ym])
  const from = days[0].iso
  const to = days[days.length - 1].iso

  // Direção: garante as ocorrências das recorrências (idempotente) para as próximas 12 semanas.
  // Cancelar uma aula/ensaio direto da lista (ex.: chuva), com o motivo.
  const cancel = useMutation({
    mutationFn: (v: { a: Activity; reason: string }) => setActivityStatus(orgId, v.a.id, 'cancelled', v.reason),
    onSuccess: () => { toast.success('Cancelado.'); qc.invalidateQueries({ queryKey: ['activities', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const gen = useMutation({
    mutationFn: () => materialize(orgId, addDaysIso(today, 84)),
    onSuccess: (n) => { if (n > 0) qc.invalidateQueries({ queryKey: ['activities', orgId] }) },
  })
  useEffect(() => { if (canManage) gen.mutate() }, [canManage, orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: raw, isLoading } = useQuery({
    queryKey: ['activities', orgId, from, to],
    placeholderData: keepPreviousData,
    queryFn: () => listActivities({ orgId, from, to }),
  })
  // Só o ciclo escolhido no menu fixo: o marcado na atividade ou, sem marca, o que cobre a data dela.
  const data = useMemo(() => raw?.filter((a) => (a.cycle_id ? a.cycle_id === cycleId : !selCycle || (a.activity_date >= selCycle.starts_on && a.activity_date <= selCycle.ends_on))), [raw, cycleId, selCycle])
  // Ao trocar de ciclo, o mês vai para dentro dele.
  useEffect(() => {
    if (!selCycle) return
    const d = today < selCycle.starts_on ? selCycle.starts_on : today > selCycle.ends_on ? selCycle.ends_on : today
    setYm({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 })
  }, [selCycle?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const holidays = useQuery({
    queryKey: ['holidays-range', orgId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('day, name').eq('organization_id', orgId).gte('day', from).lte('day', to)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((h) => [h.day as string, h.name as string])) as Record<string, string>
    },
  })
  const holidayOf = (iso: string) => holidays.data?.[iso]

  // Aniversários: de quem a pessoa logada já pode ver (RLS de integrantes), só de quem está ativo no ciclo atual; repetem todo ano.
  const memberStatus = useMemberStatus()
  const birthdays = useQuery({
    queryKey: ['birthdays', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, birth_date').eq('organization_id', orgId).is('archived_at', null).not('birth_date', 'is', null).limit(2000)
      if (error) throw error
      const map: Record<string, { id: string; name: string; year: number }[]> = {}
      for (const m of data ?? []) {
        const b = m.birth_date as string
        const name = (m.display_name as string | null)?.trim() || (m.full_name as string).trim().split(/\s+/)[0]
        ;(map[b.slice(5)] ??= []).push({ id: m.id as string, name, year: Number(b.slice(0, 4)) })
      }
      return map
    },
  })
  const birthdaysOn = (iso: string) => {
    const map = birthdays.data
    if (!map) return []
    const y = Number(iso.slice(0, 4))
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
    const out = [...(map[iso.slice(5)] ?? [])]
    if (!leap && iso.slice(5) === '02-28') out.push(...(map['02-29'] ?? [])) // 29/02 comemora em 28/02 nos anos comuns
    return out.map((p) => ({ ...p, age: y - p.year })).filter((p) => p.age >= 0 && !(memberStatus.ready && memberStatus.isInactive(p.id)))
  }

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
      {([['agenda', 'Agenda'], ['recorrencias', 'Recorrências'], ['feriados', 'Feriados']] as const).map(([k, label]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={cn('shrink-0 rounded-full px-4 py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>{label}</button>
      ))}
    </div>
  )
  const header = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Calendário</h1>
        {canManage && <Button onClick={() => setSheet({ activity: null })}><Plus className="h-4 w-4" /> Novo evento</Button>}
      </div>
  )
  const sheetEl = (
    <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
      {sheet && <EventSheet key={sheet.activity?.id ?? 'new'} activity={sheet.activity} defaultDate={selectedDay ?? today} onClose={() => setSheet(null)} />}
    </Sheet>
  )
  if (tab !== 'agenda' && canManage) {
    return (
      <div className="space-y-4">{header}{tabs}
        {tab === 'recorrencias' && <RecurrencesSettings />}
        {tab === 'feriados' && <HolidaysSettings />}
        {sheetEl}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {header}

      {tabs}

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
                  'flex h-9 flex-col items-center justify-center rounded-md p-0 hover:bg-muted',
                  Math.floor(di / 7) % 2 === 1 ? 'bg-muted/60' : 'bg-card',
                  !d.inMonth && 'opacity-40',
                  d.iso === today && 'ring-2 ring-primary',
                  selectedDay === d.iso && 'bg-muted',
                )}
                title={holidayOf(d.iso)}
                aria-label={`${formatDayLong(d.iso)}${holidayOf(d.iso) ? `, feriado: ${holidayOf(d.iso)}` : ""}${list.length ? `, ${list.length} evento(s)` : ""}${birthdaysOn(d.iso).length ? `, ${birthdaysOn(d.iso).length} aniversário(s)` : ""}`}
              >
                <span className={cn('text-xs font-semibold leading-none', holidayOf(d.iso) && 'rounded-full bg-destructive px-1.5 py-0.5 text-destructive-foreground')}>{Number(d.iso.slice(8))}</span>
                <span className="mt-0.5 flex h-1.5 flex-wrap items-center justify-center gap-0.5">
                  {birthdaysOn(d.iso).length > 0 && <Cake className="-my-0.5 h-3 w-3 text-foreground" strokeWidth={2.75} aria-hidden="true" />}
                  {list.slice(0, 4).map((a) => (
                    <span key={a.id} className={cn('h-1.5 w-1.5 rounded-full', COLOR_DOT[a.activity_types?.color ?? 'muted'], a.status === 'cancelled' && 'opacity-30')} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {selectedDay && holidayOf(selectedDay) && <Badge className="bg-destructive/15 text-destructive">Feriado: {holidayOf(selectedDay)}</Badge>}
      {selectedDay && isLoading && <Skeleton className="h-24" />}
      {selectedDay && birthdaysOn(selectedDay).length > 0 && (
        <Card className="space-y-1 p-3">
          <p className="flex items-center gap-2 font-semibold"><Cake className="h-4 w-4 text-foreground" strokeWidth={2.75} /> Aniversariantes</p>
          {birthdaysOn(selectedDay).map((p) => <p key={p.id} className="text-muted-foreground"><MemberLink id={p.id} className="font-semibold text-foreground">{p.name}</MemberLink> · {p.age} anos</p>)}
        </Card>
      )}
      {selectedDay && data && listDays.length === 0 && birthdaysOn(selectedDay).length === 0 && <EmptyState>Nenhum evento neste dia.</EmptyState>}
      <div className="space-y-4">
        {selectedDay && listDays.map((day) => (
          <section key={day} className="space-y-2">
            <h3 className="capitalize">{formatDayLong(day)}</h3>
            {byDay[day].map((a, ai) => {
              const t = a.activity_types
              const time = [formatTime(a.start_time), formatTime(a.end_time)].filter(Boolean).join(' – ')
              return (
                <Card key={a.id} className={cn('flex items-stretch gap-3 p-3', ai % 2 === 1 && 'bg-muted/50', a.status === 'cancelled' && 'opacity-60')}>
                  <span className={cn('w-1.5 shrink-0 rounded-full', COLOR_DOT[t?.color ?? 'muted'])} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ activity: a })}>
                    <p className={cn('font-semibold', a.status === 'cancelled' && 'line-through')}>{a.title}</p>
                    {a.itinerary && a.itinerary.length > 0 ? (
                      <div className="text-muted-foreground">
                        {[...a.itinerary].sort((x, y) => x.time.localeCompare(y.time)).map((x, k, list) => {
                          const loc = x.location?.trim()
                          const lastLoc = list.slice(0, k).reverse().find((y) => y.location?.trim())?.location?.trim().toLowerCase()
                          const showLoc = !!loc && loc.toLowerCase() !== lastLoc
                          return (
                            <div key={k}>
                              {showLoc && <p className="font-medium text-foreground">{loc}</p>}
                              <p>{x.time.slice(0, 5)}{x.end ? ' – ' + x.end.slice(0, 5) : ''} · {x.label}</p>
                              {x.description && <p className="whitespace-pre-wrap text-sm">{x.description}</p>}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{[time, a.location].filter(Boolean).join(' · ') || 'Horário a definir'}</p>
                    )}
                  </button>
                  {a.status === 'cancelled' && a.cancel_reason && <p className="sr-only">{a.cancel_reason}</p>}
                  {(a.status !== 'scheduled' || canManage) && (
                    <div className="flex flex-col items-end gap-1">
                      {a.status !== 'scheduled' && <Badge>{STATUS_LABEL[a.status]}{a.status === 'cancelled' && a.cancel_reason ? ` · ${a.cancel_reason}` : ''}</Badge>}
                      {canManage && a.status === 'scheduled' && (
                        <Button size="sm" variant="outline" aria-label={`Cancelar ${cancelWord(t?.name)}`} title={`Cancelar ${cancelWord(t?.name)}`}
                          onClick={() => { const reason = window.prompt(`Cancelar ${cancelWord(t?.name)} de ${a.title}?
Motivo (ex.: chuva):`, ''); if (reason !== null) cancel.mutate({ a, reason }) }}><Ban className="h-4 w-4" /> Cancelar {cancelWord(t?.name)}</Button>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </section>
        ))}
      </div>

      {sheetEl}
    </div>
  )
}
