import { isAlunoCategory } from '@/modules/members/categoryKind'
import { useQuery } from '@tanstack/react-query'
import { useOrgId, useOrganization } from '@/core/organization'
import { type Cycle } from '@/modules/cycles/service'
import { supabase } from '@/core/supabase'
import { type Activity } from '@/modules/events/service'

export interface Status { id: string; key: string; name: string; counts_as_present: boolean }

export interface RosterRow {
  member_id: string
  display_name: string
  instruments: string | null
  status_id: string | null
  notes: string | null
  is_off_roster: boolean
}

export function useStatuses() {
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

/** Ciclo da atividade: o dela, senão o que cobre a data, senão o principal. */
export function cycleOf(a: { cycle_id: string | null; activity_date: string }, cycles: Cycle[]) {
  return a.cycle_id ?? cycles.find((c) => a.activity_date >= c.starts_on && a.activity_date <= c.ends_on)?.id ?? cycles.find((c) => c.is_current)?.id ?? null
}

export interface InstrumentInfo { id: string; name: string; section_id: string; section: string }

/** Catálogo de instrumentos com o naipe de cada um (para filtrar a chamada e mostrar a equipe). */
/** Com "cycleId", "list" traz só os instrumentos que existem naquele ciclo (os botões da chamada); "all" e "byName" continuam completos, para quem toca um instrumento que saiu do ciclo. */
export function useInstrumentCatalog(cycleId?: string | null) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['instrument-catalog', orgId, cycleId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.from('instruments').select('id, name, section_id, is_active, sections(name, is_active)').eq('organization_id', orgId).eq('is_active', true).limit(1000)
      if (error) throw error
      const list = ((data ?? []) as unknown as (Omit<InstrumentInfo, 'section'> & { sections: { name: string; is_active: boolean } | null })[]).filter((i) => i.sections?.is_active).map((i) => ({ ...i, section: i.sections?.name ?? '' }))
      let inCycle = list
      if (cycleId) {
        const ic = await supabase.from('instrument_cycles').select('instrument_id').eq('organization_id', orgId).eq('cycle_id', cycleId).limit(5000)
        if (ic.error) throw ic.error
        const ids = new Set((ic.data ?? []).map((r) => r.instrument_id as string))
        if (ids.size > 0) inCycle = list.filter((i) => ids.has(i.id)) // ciclo sem nenhum instrumento cadastrado: não filtra
      }
      return { list: inCycle, all: list, byName: new Map(list.map((i) => [i.name, i])) }
    },
  })
}

/** Instrumentos que têm alunos (categoria Aluno, principal ou acumulada) participando no ciclo. */
export function useStudentInstruments(cycleId: string | null | undefined) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['student-instruments', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const [cats, parts, mc, sts, alunoCat] = await Promise.all([
        supabase.rpc('list_member_categories', { p_org: orgId, p_cycle: cycleId }),
        supabase.from('cycle_participations').select('member_id, instrument_id').eq('cycle_id', cycleId!).not('instrument_id', 'is', null).limit(5000),
        supabase.from('member_cycles').select('member_id, status_id').eq('cycle_id', cycleId!).limit(5000),
        supabase.from('member_cycle_statuses').select('id').eq('organization_id', orgId).eq('counts_as_active', true),
        supabase.from('fee_categories').select('name, system_key, base_key').eq('organization_id', orgId),
      ])
      if (alunoCat.error) throw alunoCat.error
      // Todas as categorias de Aluno: a de chave fixa (mesmo renomeada) e as irmãs sem chave, como "Aluno (percussão)".
      const alunoNames = new Set((alunoCat.data ?? []).filter((x) => isAlunoCategory({ name: x.name as string, system_key: x.system_key as string | null, base_key: x.base_key as string | null })).map((x) => x.name as string))
      if (mc.error) throw mc.error
      if (sts.error) throw sts.error
      if (cats.error) throw cats.error
      if (parts.error) throw parts.error
      const activeIds = new Set((sts.data ?? []).map((x) => x.id as string))
      const activeMembers = new Set((mc.data ?? []).filter((m) => activeIds.has(m.status_id as string)).map((m) => m.member_id as string))
      // Instrumentos: só com alunos ATIVOS. Lista da chamada: todo aluno (o servidor decide quem estava ativo na data).
      const allStudents = new Set(((cats.data ?? []) as { member_id: string; category_name: string }[]).filter((c) => alunoNames.has(c.category_name)).map((c) => c.member_id))
      const students = new Set(((cats.data ?? []) as { member_id: string; category_name: string }[])  .filter((c) => alunoNames.has(c.category_name) && activeMembers.has(c.member_id)).map((c) => c.member_id))
      return { members: allStudents, instruments: new Set((parts.data ?? []).filter((p) => students.has(p.member_id as string)).map((p) => p.instrument_id as string)) }
    },
  })
}

/** Um horário do dia: título e os instrumentos com alunos; cada um abre a chamada só daquele instrumento. */
/** Linhas da chamada que valem para contagem: mesmas regras da tela da chamada (sem monitores/professores quando não há público; só alunos em aulas). */
export function countable(rows: RosterRow[], a: Activity, _hasAudience: boolean, staff: Set<string>, studentMembers: Set<string> | undefined) {
  // Aula/oficina: só alunos contam (professores e monitores aparecem na chamada, mas não entram na contagem).
  const isClass = /oficina|aula/i.test(`${a.activity_types?.name ?? ''} ${a.title}`)
  return rows.filter((r) => !isClass || (!staff.has(r.member_id) && (r.is_off_roster || !studentMembers || studentMembers.has(r.member_id))))
}

/** Naipes (ids) da pessoa no ciclo: os que ela ministra (professor/monitor) ou, na falta, os do próprio instrumento/função (ex.: a direção que também toca). */
export function useMySectionIds(cycleId: string | null | undefined) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const catalog = useInstrumentCatalog()
  return useQuery({
    queryKey: ['my-attendance-sections', orgId, membership?.member_id, cycleId, catalog.data?.all.length],
    enabled: Boolean(cycleId && membership?.member_id && catalog.data),
    queryFn: async () => {
      const bySection = new Map(catalog.data!.all.map((i) => [i.id, i.section_id]))
      const ids = new Set<string>()
      const staff = await supabase.from('staff_assignments').select('section_id, instrument_id').eq('organization_id', orgId).eq('member_id', membership!.member_id).eq('cycle_id', cycleId!).is('valid_to', null).in('staff_kind', ['professor', 'monitor']).limit(200)
      if (staff.error) throw staff.error
      for (const r of staff.data ?? []) { const sid = (r.section_id as string | null) ?? bySection.get(r.instrument_id as string); if (sid) ids.add(sid) }
      if (ids.size === 0) {
        const parts = await supabase.from('cycle_participations').select('instrument_id, artistic_functions(section_id)').eq('member_id', membership!.member_id).eq('cycle_id', cycleId!)
        if (parts.error) throw parts.error
        for (const r of (parts.data ?? []) as unknown as { instrument_id: string | null; artistic_functions: { section_id: string | null } | null }[]) {
          const sid = (r.instrument_id ? bySection.get(r.instrument_id) : undefined) ?? r.artistic_functions?.section_id
          if (sid) ids.add(sid)
        }
      }
      return ids
    },
  })
}
