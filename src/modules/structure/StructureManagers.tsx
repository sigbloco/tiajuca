import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveInput } from '@/components/shared/ConfirmField'
import { Button, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { notifySaved } from '@/core/undo'
import { useCatalog } from './CatalogEditor'
import { describeChange, moveItemTo, invalidateCatalog, previousOf, saveCatalogItem, swapOrder, type CatalogItem, type CatalogTable } from './service'

export const byOrder = (a: CatalogItem, b: CatalogItem) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
export const nextOrder = (items: CatalogItem[]) => items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1

const SINGULAR: Partial<Record<CatalogTable, string>> = { sections: 'Naipe', subsections: 'Subnaipe', instruments: 'Instrumento' }

export function useStructureMutations(table: CatalogTable) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const items = useCatalog(table).data
  const refresh = () => invalidateCatalog(qc, orgId)
  const onError = (e: unknown) => toast.error(friendlyError(e))
  const save = useMutation({
    mutationFn: async (item: Partial<CatalogItem> & { name: string }) => ({ prev: previousOf(items, item), id: await saveCatalogItem(table, orgId, item) }),
    onSuccess: ({ prev }, item) => {
      refresh()
      notifySaved(prev && item.name !== prev.name ? 'Nome atualizado.' : describeChange(item, SINGULAR[table] ?? 'Item'),
        prev ? async () => { await saveCatalogItem(table, orgId, prev); refresh() } : undefined)
    },
    onError,
  })
  const move = useMutation({
    mutationFn: ({ a, b, list }: { a: CatalogItem; b: CatalogItem; list: CatalogItem[] }) => swapOrder(table, orgId, a, b, list),
    onSuccess: () => refresh(),
    onError,
  })
  const reorder = useMutation({
    mutationFn: ({ from, to, list }: { from: string; to: string; list: CatalogItem[] }) => moveItemTo(table, orgId, list, from, to),
    onSuccess: () => refresh(),
    onError,
  })
  return { save, move, reorder }
}

/** Linha editável: nome inline, setas de ordem, ativar/desativar e um slot extra. */
export function ItemRow({ item, siblings, canEdit, mut, extra }: {
  item: CatalogItem
  siblings: CatalogItem[]
  canEdit: boolean
  mut: ReturnType<typeof useStructureMutations>
  extra?: React.ReactNode
}) {
  const idx = siblings.findIndex((s) => s.id === item.id)
  const drag = useHoldReorder()
  const scope = siblings.map((x) => x.id).sort()[0] ?? 'x'
  const onMove = (from: string, to: string) => mut.reorder.mutate({ from, to, list: siblings })
  return (
    <div {...(canEdit ? drag.row(item.id, onMove, scope) : {})} className={cn('flex items-center gap-1.5 rounded-lg bg-background p-1.5', !item.is_active && 'opacity-60', drag.cls(item.id))}>
      {canEdit && drag.handle(item.id, onMove, scope)}
      <div className="flex flex-col">
        <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={!canEdit || idx <= 0}
          onClick={() => mut.move.mutate({ a: item, b: siblings[idx - 1], list: siblings })}><ArrowUp className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={!canEdit || idx === siblings.length - 1}
          onClick={() => mut.move.mutate({ a: item, b: siblings[idx + 1], list: siblings })}><ArrowDown className="h-3.5 w-3.5" /></Button>
      </div>
      <SaveInput value={item.name} disabled={!canEdit} aria-label={`Nome de ${item.name}`} onSave={(v) => mut.save.mutateAsync({ id: item.id, name: v })} />
      {extra}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => mut.save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })}>
          {item.is_active ? 'Desativar' : 'Ativar'}
        </Button>
      )}
    </div>
  )
}

export function useOpenSet() {
  const [open, setOpen] = useState<Set<string>>(new Set()) // todos nascem fechados
  return {
    isOpen: (k: string) => open.has(k),
    toggle: (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }),
  }
}
