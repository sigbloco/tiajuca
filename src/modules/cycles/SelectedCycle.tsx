import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { CalendarRange } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { CycleSelect } from './CycleSelect'
import { pickDefaultCycle, useCycles, type Cycle } from './service'

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
  if (!CYCLE_AREAS.has(first)) return null
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
      <CycleSelect className="w-auto min-w-0 sm:w-auto" value={cycleId} onChange={setCycleId} />
    </div>
  )
}
