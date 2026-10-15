import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/primitives'

/** Grupo que abre/fecha. Controlado pelo pai (que decide o estado inicial: todos fechados por padrão). */
export function Collapsible({ open, onToggle, title, count, right, level = 0, children }: {
  open: boolean
  onToggle: () => void
  title: ReactNode
  count?: number
  right?: ReactNode
  level?: 0 | 1
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card shadow-card', level === 1 && 'shadow-none')}>
      <div className="flex items-center gap-2 p-2 pr-3">
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-muted">
          <ChevronRight className={cn('h-5 w-5 shrink-0 transition-transform', open && 'rotate-90')} />
          <span className={cn('truncate', level === 0 ? 'font-display text-lg font-bold' : 'font-semibold')}>{title}</span>
          {count !== undefined && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
        </button>
        {right}
      </div>
      {open && <div className="space-y-2 border-t border-border p-2 pl-4">{children}</div>}
    </div>
  )
}
