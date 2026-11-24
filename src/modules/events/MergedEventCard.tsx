import { ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card, cn } from '@/components/ui/primitives'
import { formatTime } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { COLOR_DOT, type Activity } from './service'

/**
 * Vários eventos no mesmo horário num cartão só (Início e Calendário): cada linha abre o seu evento.
 * Quem registra presença tem o atalho "Presença", que abre a lista do dia (todos os eventos dele, cada um com a sua chamada).
 */
export function MergedEventCard({ items, index = 0, onOpen }: { items: Activity[]; index?: number; onOpen: (a: Activity) => void }) {
  const { membership } = useOrganization()
  const canRecord = usePermission('attendance.record', 'group')
  const start = formatTime(items[0].start_time)
  const withAttendance = items.some((a) => a.status === 'scheduled' && a.has_attendance !== false)
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
                  <span className={cn('block break-words font-medium', a.status === 'cancelled' && 'line-through')}>{a.title}{a.to_confirm && <span className="ml-2 text-sm font-semibold text-warning">A confirmar{a.to_confirm_note ? `: ${a.to_confirm_note}` : ''}</span>}</span>
                  {(end || a.location) && <span className="block text-sm text-muted-foreground">{[end && `até ${end}`, a.location].filter(Boolean).join(' · ')}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {canRecord && withAttendance && (
        <Button asChild size="sm" variant="outline" className="mt-1 w-full">
          <Link to={`/${membership?.slug}/presenca?dia=${items[0].activity_date}`}><ClipboardCheck className="h-4 w-4" /> Presença</Link>
        </Button>
      )}
    </Card>
  )
}
