import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton } from '@/components/ui/primitives'
import { formatCurrency } from '@/core/format'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { fromCents, memberPriceCents, productAvailability } from '../catalog'
import { ProductSheet } from './ProductSheet'
import { imageUrl, listProducts, reorderProducts, type ShopProduct } from './service'
import { getSettings } from './settings'

function stockSummary(p: ShopProduct): string {
  if (p.kind === 'made_to_order') return `Sob encomenda · ${p.lead_time_days ?? '?'} dia(s)`
  const a = productAvailability(p.kind, p.shop_product_variants)
  if (a.status === 'sold_out') return 'Esgotado'
  return a.units === Infinity ? 'Estoque ilimitado' : `${a.units} em estoque`
}

export function ProductsTab() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<'new' | string | null>(null)
  const q = useQuery({ queryKey: ['shop', orgId, 'products'], queryFn: () => listProducts(orgId) })
  const settings = useQuery({ queryKey: ['shop', orgId, 'settings'], queryFn: () => getSettings(orgId) })
  const defaultDiscount = settings.data?.default_member_discount_pct ?? 0
  const qc = useQueryClient()
  const [local, setLocal] = useState<string[] | null>(null) // ordem provisória enquanto arrasta
  const [dragId, setDragId] = useState<string | null>(null)
  const items = (() => {
    const list = q.data ?? []
    if (!local) return list
    const byId = new Map(list.map((p) => [p.id, p]))
    const ordered = local.map((id) => byId.get(id)).filter((p): p is ShopProduct => Boolean(p))
    return [...ordered, ...list.filter((p) => !local.includes(p.id))]
  })()
  const save = useMutation({
    mutationFn: (ids: string[]) => reorderProducts(orgId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop', orgId, 'products'] }).then(() => setLocal(null)),
    onError: (e) => { toast.error(friendlyError(e)); setLocal(null) },
  })
  const commit = (ids: string[]) => { setLocal(ids); save.mutate(ids) }
  const move = (i: number, d: -1 | 1) => {
    const ids = items.map((p) => p.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    commit(ids)
  }
  // Arrastar (mouse ou toque): ao mover sobre outro cartão, troca de lugar; ao soltar, grava.
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragId) return
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.pid && (n as HTMLElement).dataset.pid !== dragId) as HTMLElement | undefined
    if (!el) return
    const ids = items.map((p) => p.id)
    const from = ids.indexOf(dragId), to = ids.indexOf(el.dataset.pid!)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setLocal(ids)
  }
  const onDragEnd = () => {
    if (!dragId) return
    setDragId(null)
    if (local) save.mutate(local)
  }
  const current = sheet && sheet !== 'new' ? q.data?.find((p) => p.id === sheet) ?? null : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Produtos</h2>
        <Button onClick={() => setSheet('new')}><Plus className="h-4 w-4" /> Novo produto</Button>
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os produtos.</EmptyState>}
      {q.data?.length === 0 && <EmptyState>Nenhum produto ainda. Crie o primeiro.</EmptyState>}
      {items.map((p, i) => (
        <Card key={p.id} data-pid={p.id} className={`flex items-center gap-2 p-3 ${p.is_active ? '' : 'opacity-60'} ${dragId === p.id ? 'ring-2 ring-primary' : ''}`}>
          <button type="button" aria-label={`Arrastar ${p.name}`} title="Arraste para reordenar" style={{ touchAction: 'none' }}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragId(p.id); setLocal(items.map((x) => x.id)) }}
            onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
            <GripVertical className="h-5 w-5" />
          </button>
          {p.shop_product_images[0]
            ? <img src={imageUrl(p.shop_product_images[0].storage_path)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            : <div aria-hidden className="h-16 w-16 shrink-0 rounded-lg bg-muted" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{p.name} {!p.is_active && <Badge>Oculto</Badge>}</p>
            <p className="text-sm">
              {formatCurrency(fromCents(p.price_cents))}
              {p.member_discount_pct > 0 && <span className="text-muted-foreground"> · integrante {formatCurrency(fromCents(memberPriceCents(p.price_cents, p.member_discount_pct)))}</span>}
            </p>
            <p className="text-sm text-muted-foreground">{stockSummary(p)}</p>
          </div>
          <div className="flex shrink-0 flex-col">
            <Button size="icon" variant="ghost" className="h-7 w-8" aria-label={`Subir ${p.name}`} disabled={i === 0 || save.isPending} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-8" aria-label={`Descer ${p.name}`} disabled={i === items.length - 1 || save.isPending} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setSheet(p.id)}><Pencil className="h-4 w-4" /></Button>
        </Card>
      ))}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet === 'new' && <ProductSheet key={`new-${defaultDiscount}`} product={null} defaultDiscount={defaultDiscount} onSaved={setSheet} onClose={() => setSheet(null)} />}
        {current && <ProductSheet key={current.id} product={current} onSaved={setSheet} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
