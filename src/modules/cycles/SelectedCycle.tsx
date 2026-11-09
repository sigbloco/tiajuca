import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
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
  'oficina', 'alunos', 'presenca', 'vagas', 'lista-de-espera', 'inscricoes', 'relatorios',
  'repertorio', 'naipes',
  'financeiro', 'equipe', 'valores', 'cobrancas', 'mensalidades', 'bolsas',
])

/** Menu de ciclo fixo logo abaixo do caminho de navegação, o mesmo em todas as subpáginas da área. */
export function CycleBar({ base }: { base: string }) {
  const { pathname } = useLocation()
  const { cycleId, setCycleId } = useSelectedCycle()
  const first = pathname.slice(base.length).split('/').filter(Boolean)[0] ?? ''
  if (!CYCLE_AREAS.has(first)) return null
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 border-b border-border bg-background px-4 py-2 md:-mx-8 md:px-8">
      <span className="font-semibold text-muted-foreground">Ciclo</span>
      <CycleSelect value={cycleId} onChange={setCycleId} />
    </div>
  )
}
