import { confirmBox } from '@/components/shared/DialogHost'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Collapsible } from '@/components/shared/Collapsible'
import { ShowMore, usePaged } from '@/components/shared/Paged'
import { Button, Card } from '@/components/ui/primitives'
import type { TrashEntry } from './TrashDrawer'

interface Group { label?: string; /** Em vez de "Restaurar" (ex.: "Adicionar a este ciclo"). */ restoreLabel?: string; entries: TrashEntry[]; onRestore: (id: string) => void; onPurge?: (id: string) => void }

function Rows({ g }: { g: Group }) {
  const paged = usePaged(g.entries)
  return (
    <div className="grid gap-1.5">
      {paged.visible.map((e) => (
        <Card key={e.id} className="flex items-center gap-2 p-2 pl-3">
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{e.name}</p>
            {e.detail && <p className="break-words text-sm text-muted-foreground">{e.detail}</p>}
          </div>
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`${g.restoreLabel ?? 'Restaurar'} ${e.name}`} title={g.restoreLabel ?? 'Restaurar'} onClick={() => g.onRestore(e.id)}>{g.restoreLabel ? <Plus className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
          {g.onPurge && (
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" aria-label={`Excluir ${e.name} de vez`} title="Excluir de vez"
              onClick={async () => { if (await confirmBox(`Excluir “${e.name}” de vez? Isso não pode ser desfeito.`)) g.onPurge?.(e.id) }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </Card>
      ))}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} size={paged.size} onClick={paged.more} />
    </div>
  )
}

/**
 * Lixeira padrão do app: um grupo recolhível (fechado por padrão), sempre o ÚLTIMO da página, com o mesmo layout dos outros grupos.
 * Restaurar, e (se `onPurge`) excluir de vez; mostra 5 por vez. Vários tipos de item: `groups`, cada um com seu título.
 * Sem itens na lixeira, não aparece.
 */
export function TrashGroup({ entries, onRestore, onPurge, groups, title = 'Lixeira' }: {
  entries?: TrashEntry[]
  onRestore?: (id: string) => void
  /** Sem isto, não há "Excluir de vez" (o item fica guardado). */
  onPurge?: (id: string) => void
  groups?: Group[]
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const all: Group[] = groups ?? [{ entries: entries ?? [], onRestore: onRestore ?? (() => {}), onPurge }]
  const total = all.reduce((n, g) => n + g.entries.length, 0)
  if (total === 0) return null
  return (
    <Collapsible open={open} onToggle={() => setOpen((o) => !o)} tone="muted" title={title} count={total}>
      <div className="space-y-3">
        {all.filter((g) => g.entries.length > 0).map((g, i) => (
          <section key={g.label ?? i} className="space-y-1.5">
            {g.label && <h3 className="text-sm">{g.label}</h3>}
            <Rows g={g} />
          </section>
        ))}
      </div>
    </Collapsible>
  )
}
