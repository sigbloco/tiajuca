import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { CalendarRange } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useOrganization } from '@/core/organization'
import { useIsDirection } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { CycleSelect } from './CycleSelect'
import { pickDefaultCycle, useCycles, useCycleStatuses, type Cycle } from './service'

interface Ctx { cycleId: string; setCycleId: (id: string) => void; cycle: Cycle | undefined }
const SelectedCycleCtx = createContext<Ctx | null>(null)

/** Ciclo escolhido no menu fixo sob o caminho de navegação: vale para todas as subpáginas da área (padrão: o atual). */
export function SelectedCycleProvider({ children }: { children: ReactNode }) {
  const cycles = useCycles()
  const [picked, setPicked] = useState('')
  const cycleId = picked || pickDefaultCycle(cycles.data)
  const value = useMemo<Ctx>(() => ({ cycleId, setCycleId: setPicked, cycle: (cycles.data ?? []).find((c) => c.id === cycleId) }), [cycleId, cycles.data])
  return <SelectedCycleCtx.Provider value={value}>{children}</SelectedCycleCtx.Provider>
}

export function useSelectedCycle(): Ctx {
  const c = useContext(SelectedCycleCtx)
  if (!c) throw new Error('useSelectedCycle fora do SelectedCycleProvider')
  return c
}

/** Áreas que ficam sob um ciclo (o Calendário tem o seu próprio menu). */
const CYCLE_AREAS = new Set([
  '', 'oficina', 'alunos', 'presenca', 'vagas', 'lista-de-espera', 'formularios', 'relatorios',
  'repertorio', 'naipes', 'eventos', 'membros',
  'financeiro', 'equipe', 'valores', 'cobrancas', 'mensalidades', 'bolsas',
])

/** Para quem não é da direção, o ciclo só pode ser trocado no Perfil e no Calendário. */
const MEMBER_CYCLE_AREAS = new Set(['perfil', 'eventos'])

/** Ciclos em que o integrante participou (ativo no ciclo). Só é consultado para quem não é da direção. */
function useMyCycleIds(enabled: boolean): string[] | null {
  const { membership } = useOrganization()
  const statuses = useCycleStatuses()
  const q = useQuery({
    queryKey: ['my-cycle-ids', membership?.organization_id, membership?.member_id],
    enabled: enabled && Boolean(membership?.member_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('cycle_id, status_id').eq('member_id', membership!.member_id).limit(500)
      if (error) throw error
      return (data ?? []) as { cycle_id: string; status_id: string }[]
    },
  })
  if (!enabled) return null
  if (!q.data || !statuses.data) return []
  const active = new Set(statuses.data.filter((s) => s.counts_as_active).map((s) => s.id))
  return [...new Set(q.data.filter((r) => active.has(r.status_id)).map((r) => r.cycle_id))]
}

/**
 * Páginas dentro das áreas de ciclo que NÃO mudam com o ciclo: no lugar do menu aparece o aviso "Vale para todos os ciclos" (mesmo lugar, nada pula).
 * Formulários (lista, editor, configurações), Repertório, configurações do Calendário e nomes de naipes.
 */
export function isCycleIndependent(rest: string[]): boolean {
  const [first, second] = rest
  return first === 'formularios' || first === 'repertorio' || (first === 'eventos' && second === 'configuracoes') || (first === 'naipes' && second === 'configuracoes')
}

/** Menu de ciclo fixo logo abaixo do caminho de navegação, o mesmo em todas as subpáginas da área. */
export function CycleBar({ base }: { base: string }) {
  const { pathname } = useLocation()
  const { cycleId, setCycleId } = useSelectedCycle()
  const rest = pathname.slice(base.length).split('/').filter(Boolean)
  const first = rest[0] ?? ''
  const isDirection = useIsDirection()
  const { data: cycles } = useCycles()
  const mine = useMyCycleIds(!isDirection)
  const allowed = mine && mine.length > 0 ? mine : null
  // Integrante: se o ciclo escolhido não é um dos seus, cai no atual (se participou) ou no mais recente em que esteve.
  useEffect(() => {
    if (!allowed || allowed.includes(cycleId)) return
    const pick = (cycles ?? []).find((c) => c.is_current && allowed.includes(c.id)) ?? (cycles ?? []).find((c) => allowed.includes(c.id))
    if (pick) setCycleId(pick.id)
  }, [allowed, cycleId, cycles, setCycleId])
  if (isDirection ? !CYCLE_AREAS.has(first) : !MEMBER_CYCLE_AREAS.has(first)) return null
  if (isCycleIndependent(rest)) {
    return (
      <div className="mb-1.5 flex min-h-10 items-center gap-2 text-sm text-muted-foreground" role="note">
        <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
        <span>Vale para todos os ciclos</span>
      </div>
    )
  }
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="shrink-0 whitespace-nowrap font-semibold text-muted-foreground">Ciclo</span>
      <CycleSelect className="w-auto min-w-0 sm:w-auto" value={cycleId} onChange={setCycleId} onlyIds={allowed ?? undefined} />
    </div>
  )
}
