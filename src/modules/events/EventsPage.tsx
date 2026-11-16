import { ButtonRow } from '@/components/shared/ButtonRow'
import { SettingsButton } from '@/components/shared/SettingsButton'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MemberLink } from '@/modules/members/MemberLink'
import { Cake, Plus } from 'lucide-react'
import { StepNav } from '@/components/shared/StepNav'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCompetence, formatDayLong, monthGridDays, todayIso } from '@/core/format'
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
      {sheet && <EventSheet key={sheet.activity?.id ?? 'new'} startEditing={sheet.edit} activity={sheet.activity} defaultDate={selectedDay ?? today} onClose={() => setSheet(null)} />}
    </Sheet>
  )
  return (
    <div className="space-y-4">
      <div>
        <h1>Calendário</h1>
        <p className="text-muted-foreground">Ensaios, aulas, apresentações e aniversários do ciclo.</p>
      </div>
      {header}

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
            {byDay[day].map((a, ai) => <EventCard key={a.id} a={a} index={ai} onOpen={() => setSheet({ activity: a })} onEdit={() => setSheet({ activity: a, edit: true })} />)}
          </section>
        ))}
      </div>

      {sheetEl}
    </div>
  )
}
