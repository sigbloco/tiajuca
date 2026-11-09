import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, EmptyState, Sheet, SheetContent } from '@/components/ui/primitives'

export interface TrashEntry { id: string; name: string; detail?: string }

/** Botão "Lixeira (n)" que abre a lixeira própria de uma página: restaurar ou (se permitido) excluir de vez. */
export function TrashDrawer({ title = 'Lixeira', entries, onRestore, onPurge, groups }: {
  title?: string
  entries?: TrashEntry[]
  onRestore?: (id: string) => void
  /** Sem isto, não há "Excluir de vez" (o item fica guardado). */
  onPurge?: (id: string) => void
  /** Vários tipos de item na mesma página: cada grupo tem seu título e suas ações. */
  groups?: { label: string; entries: TrashEntry[]; onRestore: (id: string) => void; onPurge?: (id: string) => void }[]
}) {
  const [open, setOpen] = useState(false)
  const all = groups ?? [{ label: '', entries: entries ?? [], onRestore: onRestore ?? (() => {}), onPurge }]
  const total = all.reduce((n, g) => n + g.entries.length, 0)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> Lixeira{total > 0 ? ` (${total})` : ''}</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {open && (
          <SheetContent title={title} description="Itens removidos ficam aqui até você restaurar ou excluir de vez.">
            <div className="space-y-4">
              {total === 0 && <EmptyState>A lixeira está vazia.</EmptyState>}
              {all.filter((g) => g.entries.length > 0).map((g) => (
                <section key={g.label} className="space-y-2">
                  {g.label && <h3>{g.label}</h3>}
                  {g.entries.map((e) => (
                    <Card key={e.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{e.name}</p>
                        {e.detail && <p className="truncate text-muted-foreground">{e.detail}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => g.onRestore(e.id)}><RotateCcw className="h-4 w-4" /> Restaurar</Button>
                        {g.onPurge && (
                          <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${e.name} de vez`} title="Excluir de vez"
                            onClick={() => { if (window.confirm(`Excluir “${e.name}” de vez? Isso não pode ser desfeito.`)) g.onPurge?.(e.id) }}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </section>
              ))}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  )
}
