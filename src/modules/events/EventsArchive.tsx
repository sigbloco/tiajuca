import { confirmBox } from '@/components/shared/DialogHost'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDayLong, formatTime } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { notifyChange } from '@/core/undo'
import { COLOR_DOT, purgeActivity, restoreActivity, setActivityStatus, trashActivity, type Activity } from './service'

/**
 * Botão "Cancelados" / "Lixeira" do Calendário: abre a lista desses eventos.
 * Cancelados: dá para reativar ou apagar (vai para a lixeira). Lixeira: dá para restaurar ou excluir de vez.
 */
export function EventsArchive({ kind, items }: { kind: 'cancelled' | 'trash'; items: Activity[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['activities', orgId] })
  const isTrash = kind === 'trash'
  const title = isTrash ? 'Lixeira' : 'Cancelados'
  const sorted = [...items].sort((a, b) => b.activity_date.localeCompare(a.activity_date) || (b.start_time ?? '').localeCompare(a.start_time ?? ''))

  const run = useMutation({
    mutationFn: async (v: { action: 'reopen' | 'trash' | 'restore' | 'purge'; a: Activity }) => {
      if (v.action === 'reopen') await setActivityStatus(orgId, v.a.id, 'scheduled')
      else if (v.action === 'trash') await trashActivity(v.a.id)
      else if (v.action === 'restore') await restoreActivity(v.a.id)
      else await purgeActivity(v.a.id)
      return v
    },
    onSuccess: (v) => {
      refresh()
      if (v.action === 'reopen') notifyChange('Evento reativado.', async () => { await setActivityStatus(orgId, v.a.id, 'cancelled', v.a.cancel_reason); refresh() })
      else if (v.action === 'trash') notifyChange('Evento enviado para a lixeira.', async () => { await restoreActivity(v.a.id); refresh() })
      else if (v.action === 'restore') toast.success('Evento restaurado.')
      else toast.success('Evento excluído de vez.')
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <>
      <Button variant="outline" aria-label={title} title={title} onClick={() => setOpen(true)}>
        {isTrash ? <Trash2 className="h-4 w-4 shrink-0" /> : <Ban className="h-4 w-4 shrink-0" />} {title}{items.length > 0 ? ` (${items.length})` : ''}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {open && (
          <SheetContent title={title} description={isTrash ? 'Eventos apagados ficam aqui até você restaurar ou excluir de vez.' : 'Eventos cancelados do ciclo escolhido. Dá para reativar ou apagar.'}>
            <div className="space-y-2">
              {sorted.length === 0 && <EmptyState>{isTrash ? 'A lixeira está vazia.' : 'Nenhum evento cancelado neste ciclo.'}</EmptyState>}
              <ProgressiveList items={sorted} render={(a) => {
                const time = [formatTime(a.start_time), formatTime(a.end_time)].filter(Boolean).join(' – ')
                return (
                  <Card key={a.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-stretch gap-3">
                      <span className={cn('w-1.5 shrink-0 rounded-full', COLOR_DOT[a.activity_types?.color ?? 'muted'])} />
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{a.title}</p>
                        <p className="break-words text-muted-foreground">{[formatDayLong(a.activity_date), time].filter(Boolean).join(' · ')}</p>
                        {!isTrash && a.cancel_reason && <p className="break-words text-sm text-muted-foreground">Motivo: {a.cancel_reason}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="icon" variant="outline" disabled={run.isPending} aria-label={isTrash ? `Restaurar ${a.title}` : `Reativar ${a.title}`} title={isTrash ? 'Restaurar' : 'Reativar'}
                        onClick={() => run.mutate({ action: isTrash ? 'restore' : 'reopen', a })}><RotateCcw className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" disabled={run.isPending} aria-label={isTrash ? `Excluir ${a.title} de vez` : `Apagar ${a.title}`} title={isTrash ? 'Excluir de vez' : 'Apagar (vai para a lixeira)'}
                        onClick={async () => {
                          if (isTrash) { if (await confirmBox(`Excluir “${a.title}” de vez? Isso não pode ser desfeito.`)) run.mutate({ action: 'purge', a }) }
                          else run.mutate({ action: 'trash', a })
                        }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Card>
                )
              }} />
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  )
}
