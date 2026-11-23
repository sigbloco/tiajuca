import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { StepNav } from '@/components/shared/StepNav'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatDayShort, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { useCycles } from '@/modules/cycles/service'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { supabase } from '@/core/supabase'
import { audienceSectionIds, getAudiencesFor, listActivities, type Activity } from '@/modules/events/service'
import { useStatuses, cycleOf, useInstrumentCatalog, useStudentInstruments, useMySectionIds } from './attendanceData'
import { ActivityCard } from './ActivityCard'

/**
 * Presença: um dia por vez (o vigente), com setas para o dia anterior/seguinte com atividades.
 * mode "day" (vindo do Calendário): o dia inteiro, com todos os instrumentos (o parâmetro "dia" escolhe o dia).
 * mode "mine" (Oficina → Presença): só o que é do naipe da pessoa e, havendo um evento só, abre direto a chamada dele.
 */
export function AttendanceListPage({ mode: modeProp = 'day' }: { mode?: 'day' | 'mine' } = {}) {
  const [params] = useSearchParams()
  const mode = params.get('dia') || params.get('lista') ? 'day' : modeProp // vindo do Calendário (com o dia na URL): o dia inteiro
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
  const catalog = useInstrumentCatalog(cycleId)
  const students = useStudentInstruments(cycleId)
  const mineSec = useMySectionIds(mode === 'mine' ? cycleId : null)
  const baseItems = (data ?? []).filter((a) => a.has_attendance !== false && cycleOf(a, cycles.data ?? []) === cycleId)
  const allAud = useQuery({ queryKey: ['audiences-all', baseItems.map((a) => a.id).join(',')], enabled: mode === 'mine' && baseItems.length > 0, queryFn: () => getAudiencesFor(baseItems.map((a) => a.id)) })
  const mineReady = mode !== 'mine' || !cycleId || (mineSec.isFetched && (allAud.isFetched || baseItems.length === 0))
  const mine = mode === 'mine' ? mineSec.data : undefined
  // Evento com público segue o público (naipe ou instrumento); sem público (ou só de categoria) vale para todos.
  const instSection = new Map((catalog.data?.all ?? []).map((i) => [i.id, i.section_id]))
  const appliesToMine = (a: Activity) => {
    const aud = allAud.data?.get(a.id)
    if (!aud || aud.length === 0) return true
    const sids = audienceSectionIds(aud, instSection)
    return sids.size === 0 || [...sids].some((sid) => mine!.has(sid))
  }
  const filtering = mode === 'mine' && !!mine && mine.size > 0
  const items = filtering && mineReady ? baseItems.filter(appliesToMine) : baseItems
  const days = [...new Set(items.map((a) => a.activity_date))].sort()
  const [picked, setPicked] = useState<string | null>(params.get('dia'))
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
  // Um evento só do naipe da pessoa no dia: vai direto para a chamada dele (nela, o naipe já vem selecionado).
  if (filtering && mineReady && !picked && dayItems.length === 1) return <Navigate to={`/${membership?.slug}/presenca/${dayItems[0].id}`} replace />
  return (
    <div className="space-y-4">
      {(isLoading || !mineReady) && <Skeleton className="h-24" />}
      {data && mineReady && days.length === 0 && <EmptyState>Nenhuma atividade neste ciclo.</EmptyState>}
      {current && (
        <StepNav prevLabel="Dia anterior" nextLabel="Próximo dia" prevDisabled={idx <= 0} nextDisabled={idx >= days.length - 1} onPrev={() => setPicked(days[idx - 1])} onNext={() => setPicked(days[idx + 1])}>
          {formatDayShort(current)}{current === today && <Badge className="ml-2 bg-primary text-primary-foreground">Hoje</Badge>}
        </StepNav>
      )}
      <div className="grid gap-2">
        {dayItems.map((a) => <ActivityCard key={a.id} a={a} instruments={catalog.data?.list ?? []} studentIds={students.data?.instruments ?? new Set()} slug={membership?.slug} audience={audiences.data?.get(a.id)} staff={staffSet.data ?? new Set()} studentMembers={students.data?.members} presentIds={presentIds} />)}
      </div>
    </div>
  )
}
