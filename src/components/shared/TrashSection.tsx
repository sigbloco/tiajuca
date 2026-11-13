import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card } from '@/components/ui/primitives'
import type { TrashEntry } from './TrashDrawer'

export const PAGE_SIZE = 5

/** Mostra a lista de 5 em 5: `visible` são os itens à mostra e `more` revela mais 5. */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [count, setCount] = useState(size)
  return { visible: items.slice(0, count), hasMore: items.length > count, remaining: Math.max(0, items.length - count), more: () => setCount((c) => c + size), size }
}

export function ShowMore({ hasMore, remaining, size = PAGE_SIZE, onClick }: { hasMore: boolean; remaining: number; size?: number; onClick: () => void }) {
  if (!hasMore) return null
  return <Button type="button" variant="outline" className="w-full" onClick={onClick}>Ver mais {Math.min(size, remaining)}</Button>
}

/** Lixeira da página como grupo recolhível (fechado por padrão), embaixo do último item. */
export function TrashSection({ entries, onRestore, onPurge }: {
  entries: TrashEntry[]
  onRestore: (id: string) => void
  /** Sem isto, não há "Excluir de vez" (o item fica guardado). */
  onPurge?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <section className="space-y-2 rounded-xl border border-dashed border-border p-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left font-semibold hover:bg-muted">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Trash2 className="h-4 w-4" /> Lixeira ({entries.length})
      </button>
      {open && entries.map((e) => (
        <Card key={e.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="break-words font-semibold">{e.name}</p>
            {e.detail && <p className="break-words text-muted-foreground">{e.detail}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="outline" aria-label={`Restaurar ${e.name}`} title="Restaurar" onClick={() => onRestore(e.id)}><RotateCcw className="h-4 w-4" /></Button>
            {onPurge && (
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${e.name} de vez`} title="Excluir de vez"
                onClick={() => { if (window.confirm(`Excluir “${e.name}” de vez? Isso não pode ser desfeito.`)) onPurge(e.id) }}><Trash2 className="h-4 w-4" /></Button>
            )}
          </div>
        </Card>
      ))}
    </section>
  )
}
