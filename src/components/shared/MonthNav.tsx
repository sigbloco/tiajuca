import { StepNav } from './StepNav'
import { formatCompetence } from '@/core/format'

export interface YearMonth { y: number; m: number } // m: 0-11

export const toCompetence = ({ y, m }: YearMonth) => `${y}-${String(m + 1).padStart(2, '0')}-01`

/** Navegação de mês ("Outubro de 2026"). */
export function MonthNav({ value, onChange }: { value: YearMonth; onChange: (v: YearMonth) => void }) {
  const shift = (d: number) => { const x = new Date(Date.UTC(value.y, value.m + d, 1)); onChange({ y: x.getUTCFullYear(), m: x.getUTCMonth() }) }
  return (
    <StepNav onPrev={() => shift(-1)} onNext={() => shift(1)} prevLabel="Mês anterior" nextLabel="Próximo mês"><span className="min-w-36 inline-block">{formatCompetence(toCompetence(value))}</span></StepNav>
  )
}
