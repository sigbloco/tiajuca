import { useEffect } from 'react'
import { Select, cn } from '@/components/ui/primitives'
import { pickDefaultCycle, useCycles } from './service'

/** Seletor de ciclo controlado; escolhe o ciclo atual automaticamente na primeira carga. */
export function CycleSelect({ value, onChange, className, onlyIds }: { value: string; onChange: (id: string) => void; className?: string; /** Restringe às opções desses ciclos (integrante só vê os que fez parte). */ onlyIds?: string[] }) {
  const { data: cycles } = useCycles()
  useEffect(() => {
    if (!value && cycles?.length) onChange(pickDefaultCycle(cycles))
  }, [value, cycles, onChange])
  return (
    <Select className={cn('w-full sm:w-64', className)} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Ciclo">
      {!cycles?.length && <option value="">Nenhum ciclo</option>}
      {cycles?.filter((c) => c.is_active && (!onlyIds || onlyIds.includes(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  )
}
