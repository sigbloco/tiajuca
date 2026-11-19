import { Card, cn } from '@/components/ui/primitives'
import { formatTime } from '@/core/format'
import { COLOR_DOT, type Activity } from './service'

/** Vários eventos no mesmo horário num cartão só (Início): cada linha abre o seu evento. */
export function MergedEventCard({ items, index = 0, onOpen }: { items: Activity[]; index?: number; onOpen: (a: Activity) => void }) {
  const start = formatTime(items[0].start_time)
  return (
    <Card className={cn('space-y-1 p-3', index % 2 === 1 && 'bg-muted/50')}>
      <p className="font-semibold">{start} · {items.length} eventos</p>
      <ul className="divide-y divide-border">
        {items.map((a) => {
          const end = formatTime(a.end_time)
          return (
            <li key={a.id}>
              <button type="button" className="flex w-full items-start gap-2 py-1.5 text-left hover:underline" onClick={() => onOpen(a)}>
                <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', COLOR_DOT[a.activity_types?.color ?? 'muted'])} aria-hidden />
                <span className="min-w-0">
                  <span className="block break-words font-medium">{a.title}{a.to_confirm && <span className="ml-2 text-sm font-semibold text-warning">À confirmar{a.to_confirm_note ? `: ${a.to_confirm_note}` : ''}</span>}</span>
                  {(end || a.location) && <span className="block text-sm text-muted-foreground">{[end && `até ${end}`, a.location].filter(Boolean).join(' · ')}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
