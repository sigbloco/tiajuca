import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, ClipboardCheck, Pencil, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { notifyChange } from '@/core/undo'
import { COLOR_DOT, STATUS_LABEL, cancelWord, setActivityStatus, type Activity } from './service'

/** Cartão de evento (calendário e início): horário/roteiro, atalho para Presença, editar e cancelar. */
export function EventCard({ a, index = 0, onOpen, onEdit }: { a: Activity; index?: number; onOpen: () => void; onEdit: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  const canRecord = usePermission('attendance.record', 'group')
  const refresh = () => qc.invalidateQueries({ queryKey: ['activities', orgId] })
  const cancel = useMutation({
    mutationFn: (reason: string) => setActivityStatus(orgId, a.id, 'cancelled', reason),
    onSuccess: () => { refresh(); notifyChange('Cancelado.', async () => { await setActivityStatus(orgId, a.id, 'scheduled'); refresh() }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const reopen = useMutation({
    mutationFn: () => setActivityStatus(orgId, a.id, 'scheduled'),
    onSuccess: () => { toast.success('Reativado.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const t = a.activity_types
  const time = [formatTime(a.start_time), formatTime(a.end_time)].filter(Boolean).join(' – ')
  return (
    <Card className={cn('flex items-stretch gap-3 p-3', index % 2 === 1 && 'bg-muted/50', a.status === 'cancelled' && 'opacity-60')}>
      <span className={cn('w-1.5 shrink-0 rounded-full', COLOR_DOT[t?.color ?? 'muted'])} />
      <div className="min-w-0 flex-1">
        <button className="w-full text-left" onClick={onOpen}>
          <p className={cn('font-semibold', a.status === 'cancelled' && 'line-through')}>{a.title}</p>
          {a.itinerary && a.itinerary.length > 0 ? (
            <div className="text-muted-foreground">
              {[...a.itinerary].sort((x, y) => x.time.localeCompare(y.time)).map((x, k, list) => {
                const loc = x.location?.trim()
                const lastLoc = list.slice(0, k).reverse().find((y) => y.location?.trim())?.location?.trim().toLowerCase()
                const showLoc = !!loc && loc.toLowerCase() !== lastLoc
                return (
                  <div key={k}>
                    {showLoc && <p className="font-medium text-foreground">{loc}</p>}
                    <p>{x.time.slice(0, 5)}{x.end ? ' – ' + x.end.slice(0, 5) : ''} · {x.label}</p>
                    {x.description && <p className="whitespace-pre-wrap text-sm">{x.description}</p>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground">{[time, a.location].filter(Boolean).join(' · ') || 'Horário a definir'}</p>
          )}
        </button>
        {a.status === 'scheduled' && (canRecord || canManage) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {canRecord && <Button asChild size="sm" variant="outline" title="Presença"><Link to={`/${membership?.slug}/presenca/${a.id}`}><ClipboardCheck className="h-4 w-4" /> Presença</Link></Button>}
            {canManage && <Button size="sm" variant="outline" aria-label="Editar" title="Editar" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}
            {canManage && <Button size="sm" variant="outline" className="text-destructive" aria-label={`Cancelar ${cancelWord(t?.name)}`} title={`Cancelar ${cancelWord(t?.name)}`}
              onClick={() => { const reason = window.prompt(`Cancelar ${cancelWord(t?.name)} de ${a.title}?\nMotivo (ex.: chuva):`, ''); if (reason !== null) cancel.mutate(reason) }}><Ban className="h-4 w-4" /> Cancelar</Button>}
          </div>
        )}
        {canManage && a.status === 'cancelled' && (
          <Button size="sm" variant="outline" className="mt-2" aria-label="Desfazer cancelamento" title="Desfazer cancelamento" onClick={() => reopen.mutate()}><Undo2 className="h-4 w-4" /> Desfazer</Button>
        )}
      </div>
      {a.status !== 'scheduled' && <div className="flex flex-col items-end gap-1"><Badge>{STATUS_LABEL[a.status]}{a.status === 'cancelled' && a.cancel_reason ? ` · ${a.cancel_reason}` : ''}</Badge></div>}
    </Card>
  )
}
