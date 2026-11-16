import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, cn } from '@/components/ui/primitives'

/**
 * Navegação "anterior · título · próximo" (mês, dia, página): as duas setas esticam e ocupam todo o espaço que sobra
 * dos lados do título, que fica no centro. Um só padrão para o app inteiro.
 */
export function StepNav({ onPrev, onNext, prevLabel, nextLabel, prevDisabled, nextDisabled, children, className }: {
  onPrev: () => void; onNext: () => void
  prevLabel: string; nextLabel: string
  prevDisabled?: boolean; nextDisabled?: boolean
  children: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex w-full items-center gap-3', className)}>
      <Button type="button" size="icon" variant="outline" className="h-10 w-auto min-w-0 flex-1" aria-label={prevLabel} disabled={prevDisabled} onClick={onPrev}><ChevronLeft className="h-5 w-5" /></Button>
      <div className="shrink-0 text-center font-display text-lg font-bold">{children}</div>
      <Button type="button" size="icon" variant="outline" className="h-10 w-auto min-w-0 flex-1" aria-label={nextLabel} disabled={nextDisabled} onClick={onNext}><ChevronRight className="h-5 w-5" /></Button>
    </div>
  )
}
