import { MemberLink } from '@/modules/members/MemberLink'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MessageSquare, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FitText } from '@/components/shared/FitText'
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDayShort, formatTime, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { useCycles, type Cycle } from '@/modules/cycles/service'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { supabase } from '@/core/supabase'
import { getAudiences, getAudiencesFor, listActivities, type Activity, type AudienceInput } from '@/modules/events/service'
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

/** Ciclo da atividade: o dela, senão o que cobre a data, senão o principal. */
function cycleOf(a: { cycle_id: string | null; activity_date: string }, cycles: Cycle[]) {
  return a.cycle_id ?? cycles.find((c) => a.activity_date >= c.starts_on && a.activity_date <= c.ends_on)?.id ?? cycles.find((c) => c.is_current)?.id ?? null
}

interface InstrumentInfo { id: string; name: string; section_id: string; section: string }
/** Catálogo de instrumentos com o naipe de cada um (para filtrar a chamada e mostrar a equipe). */
function useInstrumentCatalog() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['instrument-catalog', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('instruments').select('id, name, section_id, is_active, sections(name, is_active)').eq('organization_id', orgId).eq('is_active', true).limit(1000)
      if (error) throw error
      const list = ((data ?? []) as unknown as (Omit<InstrumentInfo, 'section'> & { sections: { name: string; is_active: boolean } | null })[]).filter((i) => i.sections?.is_active).map((i) => ({ ...i, section: i.sections?.name ?? '' }))
      return { list, byName: new Map(list.map((i) => [i.name, i])) }
    },
  })
}


/** Instrumentos que têm alunos (categoria Aluno, principal ou acumulada) participando no ciclo. */
function useStudentInstruments(cycleId: string | null | undefined) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['student-instruments', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const [cats, parts, mc, sts] = await Promise.all([
        supabase.rpc('list_member_categories', { p_org: orgId, p_cycle: cycleId }),
        supabase.from('cycle_participations').select('member_id, instrument_id').eq('cycle_id', cycleId!).not('instrument_id', 'is', null).limit(5000),
        supabase.from('member_cycles').select('member_id, status_id').eq('cycle_id', cycleId!).limit(5000),
        supabase.from('member_cycle_statuses').select('id').eq('organization_id', orgId).eq('counts_as_active', true),
      ])
      if (mc.error) throw mc.error
      if (sts.error) throw sts.error
      if (cats.error) throw cats.error
      if (parts.error) throw parts.error
      const activeIds = new Set((sts.data ?? []).map((x) => x.id as string))
      const activeMembers = new Set((mc.data ?? []).filter((m) => activeIds.has(m.status_id as string)).map((m) => m.member_id as string))
      // Instrumentos: só com alunos ATIVOS. Lista da chamada: todo aluno (o servidor decide quem estava ativo na data).
      const allStudents = new Set(((cats.data ?? []) as { member_id: string; category_name: string }[]).filter((c) => c.category_name === 'Aluno').map((c) => c.member_id))
      const students = new Set(((cats.data ?? []) as { member_id: string; category_name: string }[])  .filter((c) => c.category_name === 'Aluno' && activeMembers.has(c.member_id)).map((c) => c.member_id))
      return { members: allStudents, instruments: new Set((parts.data ?? []).filter((p) => students.has(p.member_id as string)).map((p) => p.instrument_id as string)) }
    },
  })
}

/** Um horário do dia: título e os instrumentos com alunos; cada um abre a chamada só daquele instrumento. */
function ActivityCard({ a, instruments, studentIds, slug, audience }: { a: Activity; instruments: InstrumentInfo[]; studentIds: Set<string>; slug?: string; audience?: AudienceInput[] }) {
  // Evento com PÚBLICO definido: os botões são os instrumentos desse público (naipe escolhido ou o próprio instrumento).
  // Sem público: todos os instrumentos com alunos.
  const places = (audience ?? []).filter((x) => x.kind !== 'category') // categorias (Aluno…) não escolhem instrumento
  const shown = (places.length > 0
    ? instruments.filter((i) => places.some((x) => (x.kind === 'section' ? x.ref_id === i.section_id : x.ref_id === i.id)))
    : instruments.filter((i) => studentIds.has(i.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
  return (
    <Card className="flex gap-3 p-3">
      <p className="w-12 shrink-0 font-display font-bold">{formatTime(a.start_time) || '—'}</p>
      <div className="min-w-0 flex-1 space-y-2">
        <Link to={`/${slug}/presenca/${a.id}`} className="block break-words font-semibold hover:underline">{a.title}</Link>
        {shown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shown.map((i) => (
              <Link key={i.id} to={`/${slug}/presenca/${a.id}?naipe=${encodeURIComponent(i.section)}&inst=${encodeURIComponent(i.name)}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">{i.name}</Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Presença: um dia por vez (o vigente), com setas para o dia anterior/seguinte com atividades. */
export function AttendanceListPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  // A lista é do ciclo escolhido no menu fixo: as atividades dele, pela data (ou pelo ciclo marcado na atividade).
  const { cycle: selCycle, cycleId } = useSelectedCycle()
  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, 'attendance-list', selCycle?.id],
    enabled: Boolean(selCycle),
    queryFn: () => listActivities({ orgId, from: selCycle!.starts_on, to: selCycle!.ends_on }),
  })
  const cycles = useCycles()
  const catalog = useInstrumentCatalog()
  const students = useStudentInstruments(cycleId)
  const items = (data ?? []).filter((a) => a.status !== 'cancelled' && cycleOf(a, cycles.data ?? []) === cycleId)
  const days = [...new Set(items.map((a) => a.activity_date))].sort()
  const [picked, setPicked] = useState<string | null>(null)
  const current = (picked && days.includes(picked) ? picked : null) ?? days.find((d) => d >= today) ?? days[days.length - 1] ?? null
  const idx = current ? days.indexOf(current) : -1
  const dayItems = items.filter((a) => a.activity_date === current)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.title.localeCompare(b.title, 'pt-BR'))
  const audiences = useQuery({ queryKey: ['audiences-day', dayItems.map((a) => a.id).join(',')], enabled: dayItems.length > 0, queryFn: () => getAudiencesFor(dayItems.map((a) => a.id)) })
  return (
    <div className="space-y-4">
      <h1>Presença</h1>
      {isLoading && <Skeleton className="h-24" />}
      {data && days.length === 0 && <EmptyState>Nenhuma atividade neste ciclo.</EmptyState>}
      {current && (
        <div className="flex items-center justify-between gap-2">
          <Button size="icon" variant="ghost" aria-label="Dia anterior" disabled={idx <= 0} onClick={() => setPicked(days[idx - 1])}><ChevronLeft className="h-5 w-5" /></Button>
          <p className="font-display text-lg font-bold">{formatDayShort(current)}{current === today && <Badge className="ml-2 bg-primary text-primary-foreground">Hoje</Badge>}</p>
          <Button size="icon" variant="ghost" aria-label="Próximo dia" disabled={idx >= days.length - 1} onClick={() => setPicked(days[idx + 1])}><ChevronRight className="h-5 w-5" /></Button>
        </div>
      )}
      <div className="grid gap-2">
        {dayItems.map((a) => <ActivityCard key={a.id} a={a} instruments={catalog.data?.list ?? []} studentIds={students.data?.instruments ?? new Set()} slug={membership?.slug} audience={audiences.data?.get(a.id)} />)}
      </div>
    </div>
  )
}

/** Chamada: contadores fixos no topo, busca e botões grandes (uso com uma mão no celular). */
export function AttendanceRosterPage() {
  const { activityId = '' } = useParams()
  const orgId = useOrgId()
  const qc = useQueryClient()
  const statuses = useStatuses()
  const [search, setSearch] = useState('')
  const [searchParams] = useSearchParams()
  const { membership } = useOrganization()
  const [naipeSel, setNaipe] = useState<string | null>(searchParams.get('naipe'))
  const [instSel, setInst] = useState<string | null>(searchParams.get('inst'))
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [extra, setExtra] = useState('')
  const rosterKey = ['roster', orgId, activityId]

  const activity = useQuery({
    queryKey: ['activity', orgId, activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities')
        .select('id, title, activity_date, start_time, status, cycle_id, activity_types(name, color)').eq('id', activityId).single()
      if (error) throw error
      return data as unknown as Pick<Activity, 'id' | 'title' | 'activity_date' | 'start_time' | 'status' | 'cycle_id' | 'activity_types'>
    },
  })
  // Evento com público definido (ex.: ensaio de um naipe): a chamada segue esse público, sem filtros de naipe/instrumento nem regra de alunos.
  const audience = useQuery({ queryKey: ['audience', activityId], queryFn: () => getAudiences(activityId) })
  const hasAudience = (audience.data?.length ?? 0) > 0
  const roster = useQuery({
    queryKey: rosterKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_attendance_roster', { p_activity: activityId })
      if (error) throw error
      return (data ?? []) as RosterRow[]
    },
  })

  const mark = useMutation({
    mutationFn: async (v: { member: string; status: Status; notes?: string; clear?: boolean }) => {
      if (v.clear) {
        const { error } = await supabase.rpc('clear_attendance', { p_activity: activityId, p_member: v.member })
        if (error) throw error
        return
      }
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
        rows?.map((r) => (r.member_id === v.member ? { ...r, status_id: v.clear ? null : v.status.id, notes: v.clear ? null : (v.notes ?? r.notes) } : r)))
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

  // Professores e monitores do ciclo não fazem parte da chamada.
  const cyclesAll = useCycles()
  const staffIds = useQuery({
    queryKey: ['staff-ids', orgId, activity.data?.id, cyclesAll.data?.length],
    enabled: Boolean(activity.data) && Boolean(cyclesAll.data),
    queryFn: async () => {
      const cid = cycleOf(activity.data!, cyclesAll.data ?? [])
      let q = supabase.from('staff_assignments').select('member_id').eq('organization_id', orgId).is('valid_to', null).in('staff_kind', ['professor', 'monitor'])
      if (cid) q = q.eq('cycle_id', cid)
      const { data, error } = await q.limit(3000)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.member_id as string))
    },
  })
  const cycles = cyclesAll
  const students = useStudentInstruments(activity.data ? cycleOf(activity.data, cycles.data ?? []) : null)
  // Aula/oficina: só alunos (categoria Aluno no ciclo); quem foi adicionado fora da lista continua.
  const onlyStudents = !hasAudience && /oficina|aula/i.test(`${activity.data?.activity_types?.name ?? ''} ${activity.data?.title ?? ''}`)
  const rows = (roster.data ?? []).filter((r) => !staffIds.data?.has(r.member_id) && (!onlyStudents || r.is_off_roster || !students.data || students.data.members.has(r.member_id)))
  const counts = useMemo(() => {
    const by: Record<string, number> = {}
    for (const r of rows) if (r.status_id) by[r.status_id] = (by[r.status_id] ?? 0) + 1
    return by
  }, [rows])
  const catalog = useInstrumentCatalog()
  const sectionsOf = (r: RosterRow) => [...new Set((r.instruments ?? '').split(', ').map((n) => catalog.data?.byName.get(n)?.section).filter((x): x is string => !!x))]
  // Naipes com alunos.
  const studentInsts = (catalog.data?.list ?? []).filter((i) => students.data?.instruments.has(i.id))
  const naipes = hasAudience ? [] : [...new Set(studentInsts.map((i) => i.section))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  // Inteligente: quem é professor/monitor logado abre direto no seu naipe e instrumento.
  const myStaff = useQuery({
    queryKey: ['my-staff', orgId, membership?.member_id, activity.data?.id, cyclesAll.data?.length],
    enabled: Boolean(activity.data) && Boolean(cyclesAll.data) && Boolean(membership?.member_id),
    queryFn: async () => {
      const cid = cycleOf(activity.data!, cyclesAll.data ?? [])
      let q = supabase.from('staff_assignments').select('section_id, instrument_id').eq('organization_id', orgId).eq('member_id', membership!.member_id).is('valid_to', null).in('staff_kind', ['professor', 'monitor'])
      if (cid) q = q.eq('cycle_id', cid)
      const { data, error } = await q.limit(200)
      if (error) throw error
      return (data ?? []) as { section_id: string | null; instrument_id: string | null }[]
    },
  })
  const myScope = (() => {
    const list = catalog.data?.list ?? []
    const a = myStaff.data ?? []
    if (a.length === 0) return { section: '', inst: '' }
    const mine = list.filter((i) => a.some((x) => x.instrument_id === i.id || (x.section_id && x.section_id === i.section_id)))
    const secs = new Set(mine.map((i) => i.section))
    const direct = a.filter((x) => x.instrument_id)
    const only = a.length === 1 && direct.length === 1 ? list.find((i) => i.id === direct[0].instrument_id) : undefined
    return { section: secs.size === 1 ? [...secs][0] : '', inst: only?.name ?? '' }
  })()
  const naipe = hasAudience ? '' : (naipeSel ?? myScope.section)
  const inst = hasAudience ? (instSel ?? '') : instSel ?? (myScope.inst && catalog.data?.byName.get(myScope.inst)?.section === naipe ? myScope.inst : '')
  const filtered = rows.filter((r) => r.display_name.toLowerCase().includes(search.trim().toLowerCase())
    && (!naipe || sectionsOf(r).includes(naipe))
    && (!inst || (r.instruments ?? '').split(', ').includes(inst)))
  // Evento com público: dá para filtrar a chamada pelos instrumentos do público (ex.: Pernalta).
  const audInstOptions = hasAudience
    ? [...new Set((catalog.data?.list ?? []).filter((i) => (audience.data ?? []).some((x) => x.kind !== 'category' && (x.kind === 'section' ? x.ref_id === i.section_id : x.ref_id === i.id))).map((i) => i.name))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    : []
  const instOptions = [...new Set(studentInsts.filter((i) => i.section === naipe).map((i) => i.name))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const cancelled = activity.data?.status === 'cancelled'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h1 className="break-words">{activity.data?.title ?? 'Chamada'}</h1>
          {activity.data && <p className="text-muted-foreground">{formatDayShort(activity.data.activity_date, activity.data.start_time)}</p>}
        </div>
      </div>

      {/* Contadores fixos no topo */}
      <div className="sticky top-[calc(var(--viewas-h,0px)+var(--topbar-h,0px))] z-10 -mx-4 grid grid-cols-4 gap-2 border-b border-border bg-background px-4 py-2 md:mx-0 md:px-0">
        {statuses.data?.map((s) => (
          <div key={s.id} className="rounded-lg bg-card p-2 text-center shadow-card">
            <p className="font-display text-xl font-bold leading-none">{counts[s.id] ?? 0}</p>
            <FitText className="text-xs text-muted-foreground" min={9}>{s.name}s</FitText>
          </div>
        ))}
        <div className="rounded-lg bg-card p-2 text-center shadow-card">
          <p className="font-display text-xl font-bold leading-none">{rows.length}</p>
          <FitText className="text-xs text-muted-foreground" min={9}>Total</FitText>
        </div>
      </div>

      {cancelled && <Card className="p-3 text-destructive">Este evento foi cancelado. A chamada está bloqueada.</Card>}
      {roster.isError && <Card className="p-3 text-destructive">{friendlyError(roster.error)}</Card>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {hasAudience && audInstOptions.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {['', ...audInstOptions].map((n) => (
            <button key={n || 'todos'} onClick={() => setInst(n)}
              className={cn('h-9 rounded-full border px-3 text-sm font-medium', inst === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
              {n || 'Todos'}
            </button>
          ))}
        </div>
      ) : naipe && instOptions.length > 0 ? (
        // Dentro de um naipe (ex.: Oficina de percussão): filtra por instrumento (agogô, caixa de guerra…).
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setNaipe(''); setInst('') }} className="h-9 rounded-full border border-border bg-card px-3 text-sm font-medium hover:bg-muted">Todos os naipes</button>
          {['', ...instOptions].map((n) => (
            <button key={n || 'todos'} onClick={() => setInst(n)}
              className={cn('h-9 rounded-full border px-3 text-sm font-medium', inst === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
              {n || 'Todos'}
            </button>
          ))}
        </div>
      ) : naipes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {['', ...naipes].map((n) => (
            <button key={n || 'todos'} onClick={() => setNaipe(n)}
              className={cn('h-9 rounded-full border px-3 text-sm font-medium', naipe === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
              {n || 'Todos'}
            </button>
          ))}
        </div>
      )}

      {roster.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      {roster.data && rows.length === 0 && (
        <EmptyState>Ninguém elegível para esta atividade. Confira o ciclo, o status “Ativo” e o público do evento.</EmptyState>
      )}

      <div className="grid gap-2">
        {filtered.map((r) => (
          <Card key={r.member_id} className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold"><MemberLink id={r.member_id}>{r.display_name}</MemberLink></p>
                <p className="break-words text-muted-foreground">{r.instruments ?? '—'}{r.is_off_roster ? ' · fora da lista' : ''}</p>
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
                  onClick={() => mark.mutate({ member: r.member_id, status: s, clear: r.status_id === s.id })}
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
