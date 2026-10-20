import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/primitives'

export type Tone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'muted'
// Classes estáticas (o Tailwind precisa enxergá-las por inteiro).
const HEAD: Record<Tone, string> = { primary: 'bg-primary/10', secondary: 'bg-secondary/15', info: 'bg-info/10', success: 'bg-success/10', warning: 'bg-warning/15', muted: 'bg-muted' }
const BAR: Record<Tone, string> = { primary: 'border-primary/70', secondary: 'border-secondary', info: 'border-info/70', success: 'border-success/70', warning: 'border-warning/80', muted: 'border-border' }
export const TONES: Tone[] = ['primary', 'secondary', 'info', 'success', 'warning']

/** Grupo que abre/fecha. Controlado pelo pai (que decide o estado inicial: todos fechados por padrão).
 *  Nível 0 = faixa colorida; nível 1 = barra lateral colorida (sem caixas dentro de caixas). */
export function Collapsible({ open, onToggle, title, count, right, below, level = 0, tone = 'primary', children }: {
  open: boolean
  onToggle: () => void
  title: ReactNode
  count?: number
  right?: ReactNode
  /** Linha logo abaixo do nome, sempre visível (aberto ou fechado): ex.: equipe do grupo. */
  below?: ReactNode
  level?: 0 | 1
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div className={cn(level === 0 ? 'overflow-hidden rounded-lg border border-border bg-card shadow-card' : cn('border-l-4 pl-1', BAR[tone]))}>
      <div className={cn('flex items-center gap-2 p-1.5 pr-3', level === 0 ? HEAD[tone] : 'rounded-r-md bg-muted/40')}>
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-muted/60">
          <ChevronRight className={cn('h-5 w-5 shrink-0 transition-transform', open && 'rotate-90')} />
          <span className={cn('truncate', level === 0 ? 'font-display text-lg font-bold' : 'font-semibold')}>{title}</span>
          {count !== undefined && <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
        </button>
        {right}
      </div>
      {below && <div className={cn('pb-2 pl-10 pr-3 empty:hidden', level === 0 ? HEAD[tone] : 'bg-muted/40')}>{below}</div>}
      {open && <div className={cn('space-y-1.5', level === 0 ? 'p-2' : 'py-1.5 pl-2')}>{children}</div>}
    </div>
  )
}
