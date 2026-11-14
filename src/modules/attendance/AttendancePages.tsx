import { MemberLink } from '@/modules/members/MemberLink'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ChevronLeft, ChevronRight, MessageSquare, Search, Undo2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FitText } from '@/components/shared/FitText'
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDayShort, formatTime, shortName, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { useCycles, type Cycle } from '@/modules/cycles/service'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { supabase } from '@/core/supabase'
import { cancelWord, getAudiences, getAudiencesFor, listActivities, setActivityStatus, type Activity, type AudienceInput } from '@/modules/events/service'
import { promptBox } from '@/components/shared/DialogHost'
import { usePermission } from '@/core/permissions'
import { notifyChange } from '@/core/undo'
import { GroupLink } from '@/modules/members/GroupLink'

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
/** Linhas da chamada que valem para contagem: mesmas regras da tela da chamada (sem monitores/professores quando não há público; só alunos em aulas). */
function countable(rows: RosterRow[], a: Activity, _hasAudience: boolean, staff: Set<string>, studentMembers: Set<string> | undefined) {
  // Aula/oficina: só alunos contam (professores e monitores aparecem na chamada, mas não entram na contagem).
  const isClass = /oficina|aula/i.test(`${a.activity_types?.name ?? ''} ${a.title}`)
  return rows.filter((r) => !isClass || (!staff.has(r.member_id) && (r.is_off_roster || !studentMembers || studentMembers.has(r.member_id))))
}

function ActivityCard({ a, instruments, studentIds, slug, audience, staff, studentMembers, presentIds }: {
  a: Activity; instruments: InstrumentInfo[]; studentIds: Set<string>; slug?: string; audience?: AudienceInput[]
  staff: Set<string>; studentMembers?: Set<string>; presentIds: Set<string>
}) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  // Cancelar o evento inteiro: igual ao botão do calendário (pede o motivo; dá para desfazer).
  const cancel = useMutation({
    mutationFn: (reason: string) => setActivityStatus(orgId, a.id, 'cancelled', reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', orgId] }); notifyChange('Cancelado.', async () => { await setActivityStatus(orgId, a.id, 'scheduled'); qc.invalidateQueries({ queryKey: ['activities', orgId] }) }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Cancelar só um instrumento neste dia (o evento segue para os demais).
  const cancelledQ = useQuery({
    queryKey: ['item-cancel', a.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_item_cancellations').select('instrument_id').eq('activity_id', a.id)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.instrument_id as string))
    },
  })
  const cancelledInst = cancelledQ.data ?? new Set<string>()
  const toggleInst = useMutation({
    mutationFn: async (v: { id: string; name: string; cancel: boolean }) => {
      if (v.cancel) {
        const reason = await promptBox({ title: 'Cancelar', message: `Cancelar a aula de ${v.name} neste dia?\nMotivo (ex.: professor ausente):`, confirmLabel: 'Cancelar', cancelLabel: 'Voltar' })
        if (reason === null) return
        const { error } = await supabase.from('activity_item_cancellations').insert({ organization_id: orgId, activity_id: a.id, instrument_id: v.id, reason: reason.trim() || null })
        if (error) throw error
      } else {
        const { error } = await supabase.from('activity_item_cancellations').delete().eq('activity_id', a.id).eq('instrument_id', v.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-cancel', a.id] }),
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Presentes / total por instrumento (ex.: "Agogô 0/2"), a partir da lista de quem é esperado na chamada.
  const roster = useQuery({
    queryKey: ['roster-counts', a.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_attendance_roster', { p_activity: a.id })
      if (error) throw error
      return (data ?? []) as RosterRow[]
    },
  })
  const rows = roster.data ? countable(roster.data, a, (audience ?? []).length > 0, staff, studentMembers) : null
  const countOf = (name: string) => {
    if (!rows) return null
    const mine = rows.filter((r) => (r.instruments ?? '').split(', ').includes(name))
    return `${mine.filter((r) => r.status_id && presentIds.has(r.status_id)).length}/${mine.length}`
  }
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
        <div className="flex items-start justify-between gap-2">
          <Link to={`/${slug}/presenca/${a.id}`} className="block min-w-0 break-words font-semibold hover:underline">{a.title}</Link>
          {canManage && (
            <Button size="icon" variant="ghost" className="-mt-1 h-8 w-8 shrink-0 text-destructive" aria-label={`Cancelar ${cancelWord(a.activity_types?.name)}`} title={`Cancelar ${cancelWord(a.activity_types?.name)}`}
              disabled={cancel.isPending}
              onClick={async () => { const reason = await promptBox({ title: 'Cancelar', message: `Cancelar ${cancelWord(a.activity_types?.name)} de ${a.title}?\nMotivo (ex.: chuva):`, confirmLabel: 'Cancelar o evento', cancelLabel: 'Voltar' }); if (reason !== null) cancel.mutate(reason) }}><Ban className="h-4 w-4" /></Button>
          )}
        </div>
        {shown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shown.map((i) => {
              const off = cancelledInst.has(i.id)
              return (
                <span key={i.id} className={cn('inline-flex items-center rounded-full border border-border bg-card text-sm font-medium', off && 'opacity-60')}>
                  <Link to={`/${slug}/presenca/${a.id}?naipe=${encodeURIComponent(i.section)}&inst=${encodeURIComponent(i.name)}`}
                    className={cn('rounded-l-full py-1.5 pl-3 hover:bg-muted', canManage ? 'pr-1.5' : 'rounded-r-full pr-3')}>
                    <span className={off ? 'line-through' : undefined}>{i.name}</span>
                    {off ? <span className="ml-1.5 text-xs text-muted-foreground">sem aula</span> : countOf(i.name) && <span className="ml-1.5 text-muted-foreground">{countOf(i.name)}</span>}
                  </Link>
                  {canManage && (
                    <button type="button" disabled={toggleInst.isPending} aria-label={off ? `Desfazer o cancelamento de ${i.name}` : `Cancelar a aula de ${i.name}`} title={off ? 'Desfazer o cancelamento' : 'Cancelar a aula deste instrumento'}
                      className="mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => toggleInst.mutate({ id: i.id, name: i.name, cancel: !off })}>
                      {off ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </span>
              )
            })}
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
  const statuses = useStatuses()
  const presentIds = new Set((statuses.data ?? []).filter((x) => x.counts_as_present).map((x) => x.id))
  const staffSet = useQuery({
    queryKey: ['staff-ids-cycle', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('member_id').eq('organization_id', orgId).eq('cycle_id', cycleId!).is('valid_to', null).in('staff_kind', ['professor', 'monitor']).limit(3000)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.member_id as string))
    },
  })
  const audiences = useQuery({ queryKey: ['audiences-day', dayItems.map((a) => a.id).join(',')], enabled: dayItems.length > 0, queryFn: () => getAudiencesFor(dayItems.map((a) => a.id)) })
  return (
    <div className="space-y-4">
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
        {dayItems.map((a) => <ActivityCard key={a.id} a={a} instruments={catalog.data?.list ?? []} studentIds={students.data?.instruments ?? new Set()} slug={membership?.slug} audience={audiences.data?.get(a.id)} staff={staffSet.data ?? new Set()} studentMembers={students.data?.members} presentIds={presentIds} />)}
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
  // Painel clicável: filtra a lista por situação (padrão: Total = todos).
  const [statusFilter, setStatusFilter] = useState<string>('all')
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

  // Professores e monitores do ciclo não fazem parte da chamada de aulas sem público definido. Quando o evento tem PÚBLICO (ex.: Pernalta),
  // quem está no público entra mesmo sendo monitor ou professor (o servidor só inclui quem toca aquele instrumento/naipe).
  const cyclesAll = useCycles()
  interface StaffAssign { member_id: string; staff_kind: string; section_id: string | null; instrument_id: string | null; members: { full_name: string; display_name: string | null } | null }
  const staffAssign = useQuery({
    queryKey: ['staff-assign', orgId, activity.data?.id, cyclesAll.data?.length],
    enabled: Boolean(activity.data) && Boolean(cyclesAll.data),
    queryFn: async () => {
      const cid = cycleOf(activity.data!, cyclesAll.data ?? [])
      let q = supabase.from('staff_assignments').select('member_id, staff_kind, section_id, instrument_id, members(full_name, display_name)').eq('organization_id', orgId).is('valid_to', null).in('staff_kind', ['professor', 'monitor'])
      if (cid) q = q.eq('cycle_id', cid)
      const { data, error } = await q.limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as StaffAssign[]
    },
  })
  const staffIds = { data: staffAssign.data ? new Set(staffAssign.data.map((r) => r.member_id)) : undefined }
  const cycles = cyclesAll
  const students = useStudentInstruments(activity.data ? cycleOf(activity.data, cycles.data ?? []) : null)
  // Aula/oficina: só alunos (categoria Aluno no ciclo) contam. Professores e monitores ficam fixados no topo e têm a presença marcada, mas fora da contagem.
  const isClass = /oficina|aula/i.test(`${activity.data?.activity_types?.name ?? ''} ${activity.data?.title ?? ''}`)
  const isStaff = (r: RosterRow) => !!staffIds.data?.has(r.member_id)
  const rowsAll = (roster.data ?? []).filter((r) => (isClass
    ? !isStaff(r) && (r.is_off_roster || !students.data || students.data.members.has(r.member_id))
    : hasAudience || !isStaff(r)))
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
  // Aula cancelada só para este instrumento: avisa quando ele está em foco.
  const itemCancel = useQuery({
    queryKey: ['item-cancel', activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_item_cancellations').select('instrument_id').eq('activity_id', activityId)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.instrument_id as string))
    },
  })
  const focusCancelled = !!inst && (catalog.data?.list ?? []).some((i) => i.name === inst && itemCancel.data?.has(i.id))
  const inFocus = (r: RosterRow) => (!naipe || sectionsOf(r).includes(naipe)) && (!inst || (r.instruments ?? '').split(', ').includes(inst))
  // Contadores: só quem conta (alunos nas aulas), dentro do naipe/instrumento escolhido.
  const rows = rowsAll.filter(inFocus)
  const counts: Record<string, number> = {}
  for (const r of rows) if (r.status_id) counts[r.status_id] = (counts[r.status_id] ?? 0) + 1
  const filtered = rowsAll.filter((r) => inFocus(r) && r.display_name.toLowerCase().includes(search.trim().toLowerCase())
    && (statusFilter === 'all' || r.status_id === statusFilter))
  const ordered = filtered
  // Equipe da aula (chips): quem ministra o instrumento/naipe em foco. Instrumento em foco → os dele; naipe → os do naipe; nada escolhido → os do público do evento (ou todos).
  // Vale o que a pessoa MINISTRA (atribuição de professor/monitor), não o instrumento que toca. Monitor de naipe inteiro aparece em todos os instrumentos do naipe.
  const catList = catalog.data?.list ?? []
  const focusInstruments: InstrumentInfo[] = inst ? catList.filter((i) => i.name === inst)
    : naipe ? catList.filter((i) => i.section === naipe)
    : hasAudience ? catList.filter((i) => (audience.data ?? []).some((x) => x.kind !== 'category' && (x.kind === 'section' ? x.ref_id === i.section_id : x.ref_id === i.id)))
    : catList.filter((i) => rowsAll.some((r) => (r.instruments ?? '').split(', ').includes(i.name))) // sem filtro: quem ministra os instrumentos dos alunos desta chamada
  const teaches = (a: StaffAssign) => focusInstruments.some((i) => a.instrument_id === i.id || (!!a.section_id && a.section_id === i.section_id))
  const staffChips = (() => {
    if (!isClass) return []
    const by = new Map<string, { id: string; name: string; kind: 'professor' | 'monitor' }>()
    for (const a of staffAssign.data ?? []) {
      if (!teaches(a)) continue
      const kind = a.staff_kind === 'professor' ? 'professor' : 'monitor'
      const cur = by.get(a.member_id)
      const name = shortName(a.members?.full_name ?? '', a.members?.display_name)
      if (!cur) by.set(a.member_id, { id: a.member_id, name, kind })
      else if (kind === 'professor') cur.kind = 'professor'
    }
    return [...by.values()].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'professor' ? -1 : 1) || x.name.localeCompare(y.name, 'pt-BR'))
  })()
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

      {/* Contadores fixos no topo */}
      <div className="sticky top-[calc(var(--viewas-h,0px)+var(--topbar-h,0px))] z-10 -mx-4 grid grid-cols-4 gap-2 border-b border-border bg-background px-4 py-2 md:mx-0 md:px-0">
        {statuses.data?.map((s) => (
          <button type="button" key={s.id} aria-pressed={statusFilter === s.id} onClick={() => setStatusFilter(statusFilter === s.id ? 'all' : s.id)} className={cn('rounded-lg bg-card p-2 text-center shadow-card', statusFilter === s.id && 'ring-2 ring-primary')}>
            <p className="font-display text-xl font-bold leading-none">{counts[s.id] ?? 0}</p>
            <FitText className="text-xs text-muted-foreground" min={9}>{s.name}s</FitText>
          </button>
        ))}
        <button type="button" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')} className={cn('rounded-lg bg-card p-2 text-center shadow-card', statusFilter === 'all' && 'ring-2 ring-primary')}>
          <p className="font-display text-xl font-bold leading-none">{rows.length}</p>
          <FitText className="text-xs text-muted-foreground" min={9}>Total</FitText>
        </button>
      </div>

      {cancelled && <Card className="p-3 text-destructive">Este evento foi cancelado. A chamada está bloqueada.</Card>}
      {focusCancelled && !cancelled && <Card className="p-3 text-destructive">Sem aula de {inst} neste dia (cancelada).</Card>}
      {roster.isError && <Card className="p-3 text-destructive">{friendlyError(roster.error)}</Card>}

      {staffChips.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Professores e monitores">
          {staffChips.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.kind === 'professor' ? 'Professor' : 'Monitor'}</span>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {roster.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      {roster.data && rowsAll.length === 0 && (
        <EmptyState>Ninguém elegível para esta atividade. Confira o ciclo, o status “Ativo” e o público do evento.</EmptyState>
      )}

      <div className="grid gap-2">
        {ordered.map((r) => (
          <Fragment key={r.member_id}>
          <Card className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold"><MemberLink id={r.member_id}>{r.display_name}</MemberLink></p>
                <p className="break-words text-muted-foreground">{r.instruments ? r.instruments.split(', ').map((n, i) => <span key={n}>{i > 0 && ', '}<GroupLink naipe={catalog.data?.byName.get(n)?.section} inst={n}>{n}</GroupLink></span>) : '—'}{r.is_off_roster ? ' · fora da lista' : ''}</p>
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
          </Fragment>
        ))}
      </div>
    </div>
  )
}
