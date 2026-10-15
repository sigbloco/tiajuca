import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { formatCompetence } from '@/core/format'

export interface YearMonth { y: number; m: number } // m: 0-11

export const toCompetence = ({ y, m }: YearMonth) => `${y}-${String(m + 1).padStart(2, '0')}-01`

/** Navegação de mês ("Outubro de 2026"). */
export function MonthNav({ value, onChange }: { value: YearMonth; onChange: (v: YearMonth) => void }) {
  const shift = (d: number) => { const x = new Date(Date.UTC(value.y, value.m + d, 1)); onChange({ y: x.getUTCFullYear(), m: x.getUTCMonth() }) }
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="min-w-40 text-center font-display text-lg font-bold">{formatCompetence(toCompetence(value))}</span>
      <Button size="icon" variant="outline" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  )
}
