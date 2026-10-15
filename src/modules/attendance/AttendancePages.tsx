import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageSquare, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { addDaysIso, formatDayLong, formatTime, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { COLOR_BADGE, listActivities, type Activity } from '@/modules/events/service'
import { MemberPicker } from '@/modules/members/MemberPicker'

interface Status { id: string; key: string; name: string; counts_as_present: boolean }
interface RosterRow {
  member_id: string
  display_name: string
  instruments: string | null
  status_id: string | null
  notes: string | null
  is_off_roster: boolean
}

function useStatuses() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['attendance-statuses', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance_statuses').select('id, key, name, counts_as_present')
        .eq('organization_id', orgId).eq('is_active', true).order('sort_order')
      if (error) throw error
      return (data ?? []) as Status[]
    },
  })
}

// Cores por semântica (presença conta como presente → verde; demais → neutro/alerta), via tokens de tema.
const statusClass = (s: Status, active: boolean) =>
  active
    ? s.counts_as_present ? 'border-success bg-success text-white' : s.key === 'justified' ? 'border-warning bg-warning text-white' : 'border-destructive bg-destructive text-white'
    : 'border-border bg-card text-foreground hover:bg-muted'

/** Lista de atividades com chamada: últimas 4 semanas e próximas 2. */
export function AttendanceListPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, 'attendance-list', today],
    queryFn: () => listActivities({ orgId, from: addDaysIso(today, -28), to: addDaysIso(today, 14) }),
  })
  const items = (data ?? []).filter((a) => a.status !== 'cancelled').sort((a, b) => b.activity_date.localeCompare(a.activity_date))
  return (
    <div className="space-y-4">
      <h1>Presença</h1>
      {isLoading && <Skeleton className="h-24" />}
      {data && items.length === 0 && <EmptyState>Nenhuma atividade neste período.</EmptyState>}
      <div className="grid gap-2">
        {items.map((a: Activity) => (
          <Link key={a.id} to={`/${membership?.slug}/presenca/${a.id}`}>
            <Card className="flex items-center justify-between gap-3 p-3 hover:bg-muted">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="capitalize text-muted-foreground">{formatDayLong(a.activity_date)}{a.start_time ? ` · ${formatTime(a.start_time)}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {a.activity_date === today && <Badge className="bg-primary text-primary-foreground">Hoje</Badge>}
                {a.activity_types && <Badge className={COLOR_BADGE[a.activity_types.color]}>{a.activity_types.name}</Badge>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Chamada: contadores fixos no topo, busca e botões grandes (uso com uma mão no celular). */
export function AttendanceRosterPage() {
  const { activityId = '' } = useParams()
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const statuses = useStatuses()
  const [search, setSearch] = useState('')
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [extra, setExtra] = useState('')
  const rosterKey = ['roster', orgId, activityId]

  const activity = useQuery({
    queryKey: ['activity', orgId, activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities')
        .select('id, title, activity_date, start_time, status, activity_types(name, color)').eq('id', activityId).single()
      if (error) throw error
      return data as unknown as Pick<Activity, 'id' | 'title' | 'activity_date' | 'start_time' | 'status' | 'activity_types'>
    },
  })
  const roster = useQuery({
    queryKey: rosterKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_attendance_roster', { p_activity: activityId })
      if (error) throw error
      return (data ?? []) as RosterRow[]
    },
  })

  const mark = useMutation({
    mutationFn: async (v: { member: string; status: Status; notes?: string }) => {
      const { error } = await supabase.rpc('set_attendance', {
        p_activity: activityId, p_member: v.member, p_status_key: v.status.key, p_notes: v.notes ?? null,
      })
      if (error) throw error
    },
    // Atualização otimista: a lista responde na hora, mesmo com sinal ruim.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: rosterKey })
      const prev = qc.getQueryData<RosterRow[]>(rosterKey)
      qc.setQueryData<RosterRow[]>(rosterKey, (rows) =>
        rows?.map((r) => (r.member_id === v.member ? { ...r, status_id: v.status.id, notes: v.notes ?? r.notes } : r)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(rosterKey, ctx.prev)
      toast.error(friendlyError(e))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: rosterKey }),
  })
  const addExtra = useMutation({
    mutationFn: async () => {
      const present = statuses.data?.find((s) => s.counts_as_present)
      if (!present) throw new Error('Nenhum status de presença configurado.')
      const { error } = await supabase.rpc('set_attendance', { p_activity: activityId, p_member: extra, p_status_key: present.key, p_notes: null })
      if (error) throw error
    },
    onSuccess: () => { setExtra(''); toast.success('Adicionado fora da lista.'); qc.invalidateQueries({ queryKey: rosterKey }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const rows = roster.data ?? []
  const counts = useMemo(() => {
    const by: Record<string, number> = {}
    for (const r of rows) if (r.status_id) by[r.status_id] = (by[r.status_id] ?? 0) + 1
    return by
  }, [rows])
  const filtered = rows.filter((r) => r.display_name.toLowerCase().includes(search.trim().toLowerCase()))
  const cancelled = activity.data?.status === 'cancelled'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`/${membership?.slug}/presenca`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="min-w-0">
          <h1 className="truncate">{activity.data?.title ?? 'Chamada'}</h1>
          {activity.data && <p className="capitalize text-muted-foreground">{formatDayLong(activity.data.activity_date)}</p>}
        </div>
      </div>

      {/* Contadores fixos no topo */}
      <div className="sticky top-0 z-10 -mx-4 grid grid-cols-4 gap-2 border-b border-border bg-background px-4 py-2 md:mx-0 md:px-0">
        {statuses.data?.map((s) => (
          <div key={s.id} className="rounded-lg bg-card p-2 text-center shadow-card">
            <p className="font-display text-xl font-bold leading-none">{counts[s.id] ?? 0}</p>
            <p className="text-xs text-muted-foreground">{s.name}s</p>
          </div>
        ))}
        <div className="rounded-lg bg-card p-2 text-center shadow-card">
          <p className="font-display text-xl font-bold leading-none">{rows.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
      </div>

      {cancelled && <Card className="p-3 text-destructive">Este evento foi cancelado. A chamada está bloqueada.</Card>}
      {roster.isError && <Card className="p-3 text-destructive">{friendlyError(roster.error)}</Card>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {roster.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      {roster.data && rows.length === 0 && (
        <EmptyState>Ninguém elegível para esta atividade. Confira o ciclo, o status “Ativo” e o público do evento.</EmptyState>
      )}

      <div className="grid gap-2">
        {filtered.map((r) => (
          <Card key={r.member_id} className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.display_name}</p>
                <p className="truncate text-muted-foreground">{r.instruments ?? '—'}{r.is_off_roster ? ' · fora da lista' : ''}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Observação" onClick={() => setOpenNote(openNote === r.member_id ? null : r.member_id)}>
                <MessageSquare className={cn('h-4 w-4', r.notes && 'text-primary')} />
              </Button>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${statuses.data?.length ?? 3}, minmax(0, 1fr))` }}>
              {statuses.data?.map((s) => (
                <button
                  key={s.id}
                  disabled={cancelled}
                  onClick={() => mark.mutate({ member: r.member_id, status: s })}
                  className={cn('h-12 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50', statusClass(s, r.status_id === s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {openNote === r.member_id && (
              <Input className="mt-2" placeholder="Observação (ex.: motivo da justificativa)" defaultValue={r.notes ?? ''}
                onBlur={(e) => {
                  const cur = statuses.data?.find((s) => s.id === r.status_id)
                  if (!cur) return toast.message('Marque a presença antes de salvar a observação.')
                  if (e.target.value !== (r.notes ?? '')) mark.mutate({ member: r.member_id, status: cur, notes: e.target.value })
                }} />
            )}
          </Card>
        ))}
      </div>

      {!cancelled && (
        <Card className="space-y-2 p-3">
          <h3>Adicionar fora da lista</h3>
          <MemberPicker value={extra} onChange={setExtra} />
          <Button disabled={!extra || addExtra.isPending} onClick={() => addExtra.mutate()}>Adicionar como presente</Button>
        </Card>
      )}
    </div>
  )
}
