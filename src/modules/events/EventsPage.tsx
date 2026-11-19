import { ButtonRow } from '@/components/shared/ButtonRow'
import { SettingsButton } from '@/components/shared/SettingsButton'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MemberLink } from '@/modules/members/MemberLink'
import { Cake, Plus, Star } from 'lucide-react'
import { StepNav } from '@/components/shared/StepNav'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCompetence, formatDayLong, formatDayShort, formatTime, monthGridDays, todayIso } from '@/core/format'
import { supabase } from '@/core/supabase'
import { useOrgId, useOrganization } from '@/core/organization'
import { useIsDirection, usePermission } from '@/core/permissions'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { useMemberStatus } from '@/modules/members/useMemberStatus'
import { EventCard } from './EventCard'
import { EventSheet } from './EventSheet'
import { EventsArchive } from './EventsArchive'
import { RecurrenceDay } from './RecurrenceDay'
import { COLOR_DOT, listActivities, materialize, type Activity } from './service'

const WEEK_HEAD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Evento pontual: não vem de uma recorrência. */
const isSpecial = (a: Activity) => !a.recurrence_rule_id
/** "hoje", "amanhã" ou "faltam N dias" para uma data. */
function daysUntilText(date: string, today: string): string {
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Faltam ${n} dias`
}

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
  const [sheet, setSheet] = useState<{ activity: Activity | null; edit?: boolean } | null>(null)

  const days = useMemo(() => monthGridDays(ym.y, ym.m), [ym])
  const from = days[0].iso
  const to = days[days.length - 1].iso

  // Direção: garante as ocorrências das recorrências (idempotente) para as próximas 12 semanas.
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
  const data = useMemo(() => raw?.filter((a) => a.status !== 'cancelled').filter((a) => (a.cycle_id ? a.cycle_id === cycleId : !selCycle || (a.activity_date >= selCycle.starts_on && a.activity_date <= selCycle.ends_on))), [raw, cycleId, selCycle])
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
      const { data, error } = await supabase.rpc('birthday_list', { p_org: orgId })
      if (error) throw error
      // Dia e mês para todos; o ano (idade) só chega para Titular, direção e professores/monitores (o banco decide).
      const map: Record<string, { id: string; name: string; year: number | null; org?: boolean }[]> = {}
      for (const m of (data ?? []) as { member_id: string | null; full_name: string; display_name: string | null; month_day: string; birth_year: number | null; is_org: boolean }[]) {
        if (m.is_org) { (map[m.month_day] ??= []).push({ id: 'org', name: m.full_name, year: m.birth_year, org: true }); continue }
        const name = m.display_name?.trim() || m.full_name.trim().split(/\s+/)[0]
        ;(map[m.month_day] ??= []).push({ id: m.member_id as string, name, year: m.birth_year })
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
    return out.map((p) => ({ ...p, age: p.year === null ? null : y - p.year })).filter((p) => (p.age === null || p.age >= 0) && !(memberStatus.ready && memberStatus.isInactive(p.id)))
  }

  // Pontual = evento que não vem de recorrência (apresentação, confraternização, Cortejo...).
  const [onlySpecial, setOnlySpecial] = useState(false)
  const view = useMemo(() => (onlySpecial ? (data ?? []).filter(isSpecial) : data), [data, onlySpecial])
  const byDay = useMemo(() => {
    const map: Record<string, Activity[]> = {}
    for (const a of view ?? []) (map[a.activity_date] ??= []).push(a)
    return map
  }, [view])
  // Próximos eventos pontuais do ciclo (de hoje em diante), mesmo que estejam em meses lá na frente.
  const upcomingFrom = selCycle && selCycle.ends_on >= today ? (selCycle.starts_on > today ? selCycle.starts_on : today) : today
  const upcomingTo = selCycle?.ends_on && selCycle.ends_on >= upcomingFrom ? selCycle.ends_on : addDaysIso(today, 365)
  const highlights = useQuery({
    queryKey: ['activities', orgId, 'highlights', upcomingFrom, upcomingTo, cycleId],
    queryFn: async () => (await listActivities({ orgId, from: upcomingFrom, to: upcomingTo })).filter((a) => isSpecial(a) && a.status !== 'cancelled' && (a.cycle_id ? a.cycle_id === cycleId : true)).slice(0, 12),
  })
  const goTo = (a: Activity) => {
    setYm({ y: Number(a.activity_date.slice(0, 4)), m: Number(a.activity_date.slice(5, 7)) - 1 })
    setSelectedDay(a.activity_date)
    setSheet({ activity: a })
  }

  const [onlyPending, setOnlyPending] = useState(false)
  const pending = useMemo(() => (data ?? []).filter((a) => a.to_confirm), [data])
  const monthPrefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`
  const listDays = Object.keys(byDay).filter((d) => d.startsWith(monthPrefix) && (!selectedDay || d === selectedDay)).sort()
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + delta, 1))
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
    setSelectedDay(null)
  }

  // Cancelados e Lixeira: lista de todo o ciclo escolhido (sem depender do mês aberto no calendário).
  const rangeFrom = selCycle?.starts_on ?? '2000-01-01'
  const rangeTo = selCycle?.ends_on ?? '2100-12-31'
  const archived = useQuery({
    queryKey: ['activities', orgId, 'archive', rangeFrom, rangeTo],
    enabled: canManage,
    queryFn: async () => {
      const [all, trashed] = await Promise.all([
        listActivities({ orgId, from: rangeFrom, to: rangeTo }),
        listActivities({ orgId, from: rangeFrom, to: rangeTo, trashed: true }),
      ])
      return { cancelled: all.filter((a) => a.status === 'cancelled'), trashed }
    },
  })
  const isDirection = useIsDirection()
  const header = canManage && (
    <ButtonRow>
      <Button variant="add" onClick={() => setSheet({ activity: null })}><Plus className="h-4 w-4 shrink-0" /> Novo evento</Button>
      <EventsArchive kind="cancelled" items={archived.data?.cancelled ?? []} />
      <EventsArchive kind="trash" items={archived.data?.trashed ?? []} />
      {isDirection && <SettingsButton to={`/${membership?.slug}/eventos/configuracoes`} />}
    </ButtonRow>
  )
  const sheetEl = (
    <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
      {sheet && <EventSheet key={sheet.activity?.id ?? 'new'} presence="day" startEditing={sheet.edit} activity={sheet.activity} defaultDate={selectedDay ?? today} onClose={() => setSheet(null)} />}
    </Sheet>
  )
  return (
    <div className="space-y-4">
      <div>
        <h1>Calendário</h1>
        <p className="text-muted-foreground">Ensaios, aulas, apresentações e aniversários do ciclo.</p>
      </div>
      {header}
      {(highlights.data?.length ?? 0) > 0 && (
        <section className="space-y-1.5" aria-label="Em destaque">
          <h3 className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-current text-primary" aria-hidden /> Em destaque</h3>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {highlights.data!.map((a) => (
              <button key={a.id} type="button" onClick={() => goTo(a)} className="w-44 shrink-0 rounded-xl border border-primary/40 bg-primary/5 p-2.5 text-left transition hover:bg-primary/10">
                <p className="text-xs font-semibold capitalize text-muted-foreground">{formatDayShort(a.activity_date)}{a.start_time ? ' · ' + formatTime(a.start_time) : ''}</p>
                <p className="line-clamp-2 break-words font-semibold leading-tight">{a.title}</p>
                <p className="mt-0.5 text-xs font-semibold text-primary">{daysUntilText(a.activity_date, today)}{a.to_confirm ? ' · à confirmar' : ''}</p>
              </button>
            ))}
          </div>
        </section>
      )}
      <ButtonRow>
        <Button variant={onlySpecial ? 'default' : 'outline'} aria-pressed={onlySpecial} onClick={() => setOnlySpecial(!onlySpecial)}><Star className="h-4 w-4 shrink-0" /> Só eventos pontuais</Button>
        {pending.length > 0 && (
          <Button variant={onlyPending ? 'default' : 'outline'} aria-pressed={onlyPending} onClick={() => setOnlyPending(!onlyPending)}>
            À confirmar ({pending.length})
          </Button>
        )}
      </ButtonRow>
      {onlyPending && (
        <div className="space-y-4">
          {[...new Set(pending.map((a) => a.activity_date))].sort().map((day) => (
            <section key={day} className="space-y-2">
              <h3 className="capitalize">{formatDayLong(day)}</h3>
              {pending.filter((a) => a.activity_date === day).map((a, ai) => <EventCard key={a.id} a={a} presence="day" index={ai} onOpen={() => setSheet({ activity: a })} onEdit={() => setSheet({ activity: a, edit: true })} />)}
            </section>
          ))}
        </div>
      )}

      <Card className="p-3">
        <StepNav className="mb-2" prevLabel="Mês anterior" nextLabel="Próximo mês" onPrev={() => shift(-1)} onNext={() => shift(1)}>{formatCompetence(monthPrefix)}</StepNav>
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
                  {list.slice(0, 4).map((a) => isSpecial(a) ? (
                    <Star key={a.id} className={cn('-my-0.5 h-3 w-3 fill-current', a.status === 'cancelled' && 'opacity-30')} style={{ color: 'rgb(var(--primary))' }} aria-hidden="true" />
                  ) : (
                    <span key={a.id} className={cn('h-1.5 w-1.5 rounded-full', COLOR_DOT[a.activity_types?.color ?? 'muted'], a.status === 'cancelled' && 'opacity-30', a.to_confirm && 'border border-foreground/60 bg-transparent')} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {selectedDay && holidayOf(selectedDay) && <Badge className="bg-destructive/15 text-destructive">Feriado: {holidayOf(selectedDay)}</Badge>}
      {canManage && selectedDay && raw && <RecurrenceDay day={selectedDay} existing={raw.filter((a) => a.activity_date === selectedDay)} />}
      {selectedDay && isLoading && <Skeleton className="h-24" />}
      {selectedDay && birthdaysOn(selectedDay).length > 0 && (
        <Card className="space-y-1 p-3">
          <p className="flex items-center gap-2 font-semibold"><Cake className="h-4 w-4 text-foreground" strokeWidth={2.75} /> Aniversariantes</p>
          {birthdaysOn(selectedDay).map((p) => p.org
            ? <p key="org" className="text-muted-foreground"><span className="font-semibold text-foreground">{p.name}</span> · {p.age === 0 ? 'fundação do bloco (primeiro cortejo)' : `${p.age} ${p.age === 1 ? 'ano' : 'anos'} de fundação`}</p>
            : <p key={p.id} className="text-muted-foreground"><MemberLink id={p.id} className="font-semibold text-foreground">{p.name}</MemberLink>{p.age !== null && <> · {p.age} anos</>}</p>)}
        </Card>
      )}
      {selectedDay && data && listDays.length === 0 && birthdaysOn(selectedDay).length === 0 && <EmptyState>Nenhum evento neste dia.</EmptyState>}
      <div className="space-y-4">
        {selectedDay && listDays.map((day) => (
          <section key={day} className="space-y-2">
            <h3 className="capitalize">{formatDayLong(day)}</h3>
            {byDay[day].map((a, ai) => <EventCard key={a.id} a={a} presence="day" index={ai} onOpen={() => setSheet({ activity: a })} onEdit={() => setSheet({ activity: a, edit: true })} />)}
          </section>
        ))}
      </div>

      {sheetEl}
    </div>
  )
}
