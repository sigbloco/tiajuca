import { MemberLink } from '@/modules/members/MemberLink'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Search } from 'lucide-react'
import { Fragment, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChipRows } from '@/components/shared/ChipRows'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { FitChoice } from '@/components/shared/FitLabel'
import { FitText } from '@/components/shared/FitText'
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDayShort } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { useCycles } from '@/modules/cycles/service'
import { supabase } from '@/core/supabase'
import { type Activity } from '@/modules/events/service'
import { useSetCrumbOverride } from '@/core/breadcrumb'
import { GroupLink } from '@/modules/members/GroupLink'
import { MemberAvatar } from '@/modules/members/MemberAvatar'
import { type Status, type RosterRow, useStatuses, cycleOf, useInstrumentCatalog, useStudentInstruments, useMySectionIds } from './attendanceData'

// Cores por semântica (presença conta como presente → verde; demais → neutro/alerta), via tokens de tema.
export const statusClass = (s: Status, active: boolean) =>
  active
    ? s.counts_as_present ? 'border-success bg-success text-white' : s.key === 'justified' ? 'border-warning bg-warning text-white' : 'border-destructive bg-destructive text-white'
    : 'border-border bg-card text-foreground hover:bg-muted'

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
  // Filtro "Professores e Monitores" (não acumula com naipe/instrumento).
  const [staffOnly, setStaffOnly] = useState(false)
  // Justificado exige motivo: ao tocar no botão abre o campo (rascunho por pessoa) e só conta depois do OK.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const dropDraft = (id: string) => setDraft((d) => { const n = { ...d }; delete n[id]; return n })
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
      let q = supabase.from('staff_assignments').select('member_id, staff_kind, section_id, instrument_id, members!inner(full_name, display_name)').is('members.archived_at', null).eq('organization_id', orgId).is('valid_to', null).in('staff_kind', ['professor', 'monitor'])
      if (cid) q = q.eq('cycle_id', cid)
      const { data, error } = await q.limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as StaffAssign[]
    },
  })
  // Regentes: só ganham o chip "Regente" (não entram no grupo de professores e monitores).
  const regentes = useQuery({
    queryKey: ['regentes', orgId, activity.data?.id, cyclesAll.data?.length],
    enabled: Boolean(activity.data) && Boolean(cyclesAll.data),
    queryFn: async () => {
      const cid = cycleOf(activity.data!, cyclesAll.data ?? [])
      let q = supabase.from('staff_assignments').select('member_id').eq('organization_id', orgId).is('valid_to', null).eq('staff_kind', 'regente')
      if (cid) q = q.eq('cycle_id', cid)
      const { data, error } = await q.limit(500)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.member_id as string))
    },
  })
  const staffIds = { data: staffAssign.data ? new Set(staffAssign.data.map((r) => r.member_id)) : undefined }
  const cycles = cyclesAll
  const students = useStudentInstruments(activity.data ? cycleOf(activity.data, cycles.data ?? []) : null)
  // Aula/oficina: só alunos (categoria Aluno no ciclo) contam. Professores e monitores ficam fixados no topo e têm a presença marcada, mas fora da contagem.
  const isClass = /oficina|aula/i.test(`${activity.data?.activity_types?.name ?? ''} ${activity.data?.title ?? ''}`)
  const isStaff = (r: RosterRow) => !!staffIds.data?.has(r.member_id)
  const catalog = useInstrumentCatalog()
  const catList = catalog.data?.list ?? []
  // Professores e monitores têm a mesma linha dos alunos, fixados no topo; só nas aulas ficam fora da contagem.
  const rowsAll = (roster.data ?? []).filter((r) => isStaff(r) || !isClass || r.is_off_roster || !students.data || students.data.members.has(r.member_id))
  // Instrumentos de uma pessoa: os que toca e, se for professor/monitor, os que ministra (de naipe inteiro = todos do naipe).
  const instsOf = (r: RosterRow) => {
    const set = new Set((r.instruments ?? '').split(', ').filter(Boolean))
    for (const a of staffAssign.data ?? []) if (a.member_id === r.member_id) for (const i of catList) if (a.instrument_id === i.id || (!!a.section_id && a.section_id === i.section_id)) set.add(i.name)
    return set
  }
  const sectionsOf = (r: RosterRow) => [...new Set([...instsOf(r)].map((n) => catalog.data?.byName.get(n)?.section).filter((x): x is string => !!x))]
  const staffKind = (id: string) => { const l = (staffAssign.data ?? []).filter((a) => a.member_id === id); return l.length === 0 ? null : l.some((a) => a.staff_kind === 'professor') ? 'Professor' : 'Monitor' }
  // Naipes de quem está na chamada (hierarquia: naipe → instrumento).
  const naipes = [...new Set(rowsAll.flatMap(sectionsOf))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
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
  // Sem atribuição de professor/monitor (ex.: a direção que também toca): abre no naipe do próprio instrumento.
  const mySections = useMySectionIds(activity.data && cyclesAll.data ? cycleOf(activity.data, cyclesAll.data) : null)
  const myScope = (() => {
    const list = catalog.data?.list ?? []
    const a = myStaff.data ?? []
    if (a.length === 0) {
      const names = [...new Set(list.filter((i) => mySections.data?.has(i.section_id)).map((i) => i.section))]
      return { section: names.length === 1 ? names[0] : '', inst: '' }
    }
    const mine = list.filter((i) => a.some((x) => x.instrument_id === i.id || (x.section_id && x.section_id === i.section_id)))
    const secs = new Set(mine.map((i) => i.section))
    const direct = a.filter((x) => x.instrument_id)
    const only = a.length === 1 && direct.length === 1 ? list.find((i) => i.id === direct[0].instrument_id) : undefined
    return { section: secs.size === 1 ? [...secs][0] : '', inst: only?.name ?? '' }
  })()
  const naipe = staffOnly ? '' : (naipeSel ?? myScope.section)
  const instOptions = naipe ? [...new Set(rowsAll.flatMap((r) => (r.instruments ?? '').split(', ')).filter((n) => catalog.data?.byName.get(n)?.section === naipe))].sort((a, b) => a.localeCompare(b, 'pt-BR')) : []
  // Naipe com um instrumento só (ex.: Performance → Pernalta): vem selecionado e não dá para desmarcar.
  const soloInst = instOptions.length === 1 ? instOptions[0] : ''
  const instPick = instSel ?? (myScope.inst && catalog.data?.byName.get(myScope.inst)?.section === naipe ? myScope.inst : '')
  const inst = staffOnly ? '' : soloInst || instPick
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
  const memberCats = useQuery({
    queryKey: ['roster-member-cats', orgId, activity.data?.id, cyclesAll.data?.length],
    enabled: Boolean(activity.data) && Boolean(cyclesAll.data),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_member_categories', { p_org: orgId, p_cycle: cycleOf(activity.data!, cyclesAll.data ?? []) })
      if (error) throw error
      const by = new Map<string, string[]>()
      for (const r of (data ?? []) as { member_id: string; category_name: string; is_extra?: boolean }[]) {
        const list = by.get(r.member_id) ?? []
        if (r.is_extra) list.push(r.category_name); else list.unshift(r.category_name) // principal primeiro
        by.set(r.member_id, list)
      }
      return by
    },
  })
  const inFocus = (r: RosterRow) => (!staffOnly || isStaff(r)) && (!naipe || sectionsOf(r).includes(naipe)) && (!inst || instsOf(r).has(inst))
  // Contadores: só quem conta (alunos nas aulas), dentro do naipe/instrumento escolhido.
  const rows = rowsAll.filter(inFocus).filter((r) => !(isClass && isStaff(r) && !staffOnly))
  const counts: Record<string, number> = {}
  for (const r of rows) if (r.status_id) counts[r.status_id] = (counts[r.status_id] ?? 0) + 1
  const filtered = rowsAll.filter((r) => inFocus(r) && r.display_name.toLowerCase().includes(search.trim().toLowerCase())
    && (statusFilter === 'all' || r.status_id === statusFilter))
  const ordered = [...filtered.filter(isStaff), ...filtered.filter((r) => !isStaff(r))]
  const hasBoth = ordered.some(isStaff) && ordered.some((r) => !isStaff(r))
  // Instrumentos do naipe escolhido que alguém toca nesta chamada.
  const hasStaff = rowsAll.some(isStaff)
  // Todos os botões de filtro têm a mesma altura (a do mais alto: duas linhas), respiro padrão e texto que nunca vaza.
  const chipCls = (on: boolean) => cn('relative flex min-h-8 items-center justify-center break-words rounded-full border px-2 py-0 text-center text-sm font-medium leading-[1.05]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')
  const cancelled = activity.data?.status === 'cancelled'
  // Evento que não é aula/oficina (ex.: Cortejo): o caminho vem do Calendário, não da Oficina.
  // Aula/oficina: "Presença" no caminho abre a lista do dia (todos os naipes), mesmo quando se chegou direto na chamada do naipe.
  useSetCrumbOverride(activity.data && membership
    ? (isClass
      ? [{ label: 'Oficina', to: `/${membership.slug}/oficina` }, { label: 'Presença', to: `/${membership.slug}/presenca?dia=${activity.data.activity_date}` }, { label: 'Chamada' }]
      : [{ label: 'Calendário', to: `/${membership.slug}/eventos` }, { label: activity.data.title }, { label: 'Presença' }])
    : null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h1 className="break-words">{activity.data?.title ?? 'Chamada'}</h1>
          {activity.data && <p className="text-muted-foreground">{formatDayShort(activity.data.activity_date, activity.data.start_time)}</p>}
        </div>
      </div>

      {(naipes.length > 0 || hasStaff) && (
        <div className="space-y-2">
          <ButtonRow role="group" aria-label="Filtros">
            {naipes.map((n) => (
              <button key={n} type="button" aria-pressed={naipe === n} className={chipCls(naipe === n)}
                onClick={() => { setStaffOnly(false); setNaipe(naipe === n ? '' : n); setInst('') }}>{n}</button>
            ))}
            {hasStaff && (
              <button type="button" aria-pressed={staffOnly} className={chipCls(staffOnly)} aria-label="Professores e Monitores"
                onClick={() => { setStaffOnly(!staffOnly); setNaipe(''); setInst('') }}>
                <FitChoice options={['Professores + Monitores', 'Profs. + Monitores', 'Profs. + Mons.', 'Docentes']} />
              </button>
            )}
          </ButtonRow>
          {naipe && instOptions.length > 0 && (
            <ChipRows role="group" aria-label="Instrumentos">
              {instOptions.map((n) => (
                <button key={n} type="button" aria-pressed={inst === n} className={chipCls(inst === n)} disabled={instOptions.length === 1} onClick={() => setInst(inst === n ? '' : n)}>{n}</button>
              ))}
            </ChipRows>
          )}
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {roster.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      {roster.data && rowsAll.length === 0 && (
        <EmptyState>Ninguém elegível para esta atividade. Confira o ciclo, o status “Ativo” e o público do evento.</EmptyState>
      )}

      <div className="grid gap-2">
        {ordered.map((r, oi) => (
          <Fragment key={r.member_id}>
          {hasBoth && (oi === 0 || isStaff(ordered[oi - 1]) !== isStaff(r)) && <p className="mt-1 font-semibold text-muted-foreground">{isStaff(r) ? 'Professores e monitores' : 'Integrantes'}</p>}
          <Card className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
              <MemberAvatar memberId={r.member_id} name={null} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="font-semibold"><MemberLink id={r.member_id}>{r.display_name}</MemberLink></p>
                <p className="break-words text-muted-foreground">{r.instruments ? r.instruments.split(', ').map((n, i) => <span key={n}>{i > 0 && ', '}<GroupLink naipe={catalog.data?.byName.get(n)?.section} inst={n}>{n}</GroupLink></span>) : '—'}{r.is_off_roster ? ' · fora da lista' : ''}</p>
                {[...(isStaff(r) && staffKind(r.member_id) ? [staffKind(r.member_id)!] : []), ...(regentes.data?.has(r.member_id) ? ['Regente'] : []), ...(memberCats.data?.get(r.member_id) ?? [])].length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...(isStaff(r) && staffKind(r.member_id) ? [staffKind(r.member_id)!] : []), ...(regentes.data?.has(r.member_id) ? ['Regente'] : []), ...(memberCats.data?.get(r.member_id) ?? [])].map((c) => <Badge key={c} className="bg-muted">{c}</Badge>)}
                  </div>
                )}
              </div>
              </div>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${statuses.data?.length ?? 3}, minmax(0, 1fr))` }}>
              {statuses.data?.map((s) => {
                const isJust = s.key === 'justified'
                const active = r.status_id === s.id || (isJust && r.member_id in draft)
                return (
                  <button
                    key={s.id}
                    disabled={cancelled}
                    onClick={() => {
                      if (isJust && r.status_id !== s.id) { if (r.member_id in draft) dropDraft(r.member_id); else setDraft((d) => ({ ...d, [r.member_id]: r.notes ?? '' })); return }
                      dropDraft(r.member_id)
                      mark.mutate({ member: r.member_id, status: s, clear: r.status_id === s.id })
                    }}
                    className={cn('h-9 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50', statusClass(s, active))}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
            {(() => {
              const just = statuses.data?.find((x) => x.key === 'justified')
              if (!just) return null
              const editing = r.member_id in draft
              if (editing) {
                const text = draft[r.member_id]
                const ok = text.trim().length > 0
                const confirm = () => { if (!ok) return; mark.mutate({ member: r.member_id, status: just, notes: text.trim() }); dropDraft(r.member_id) }
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <Input autoFocus className="min-w-0 flex-1" placeholder="Motivo da justificativa *" value={text} onChange={(e) => setDraft((d) => ({ ...d, [r.member_id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm() } }} />
                    <Button size="icon" variant="outline" aria-label="Confirmar motivo" title="Confirmar" disabled={!ok} onClick={confirm}><Check className="h-4 w-4" /></Button>
                  </div>
                )
              }
              if (r.status_id === just.id) {
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm">{r.notes?.trim() || <span className="italic text-muted-foreground">Sem motivo</span>}</p>
                    <Button size="icon" variant="outline" aria-label="Editar motivo" title="Editar motivo" onClick={() => setDraft((d) => ({ ...d, [r.member_id]: r.notes ?? '' }))}><Pencil className="h-4 w-4" /></Button>
                  </div>
                )
              }
              return null
            })()}
          </Card>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
