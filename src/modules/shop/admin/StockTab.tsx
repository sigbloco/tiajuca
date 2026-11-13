import { requireFields } from '@/core/required'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { ShowMore, TrashSection, usePaged } from '@/components/shared/TrashSection'
import { Badge, Button, Card, EmptyState, Input, Label, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { availableUnits } from '../catalog'
import { createStockItem, listProducts, listStockItems, updateStockItem, type StockItem } from './service'

/** Singular para 0 e 1, plural a partir de 2 (português). */
const plural = (n: number, one: string, many: string) => (n >= 2 ? many : one)

function ItemSheet({ item, minStock, onClose }: { item: StockItem | null; minStock: number; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [name, setName] = useState(item?.name ?? '')
  const [unlimited, setUnlimited] = useState(item ? item.stock === null : false)
  const [qty, setQty] = useState(item?.stock === null || !item ? '0' : String(item.stock))
  const stock = unlimited ? null : Number(qty)
  const save = useMutation({
    mutationFn: () => (item ? updateStockItem(item.id, { name: name.trim(), stock }) : createStockItem(orgId, name, stock)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop', orgId, 'stock'] }); toast.success(item ? 'Item atualizado.' : 'Item criado.'); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={item ? 'Editar item de estoque' : 'Novo item de estoque'} description="Um item é algo que você guarda e vende, avulso ou dentro de um kit.">
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([['Nome', name.trim()], ['Quantidade em estoque' + (minStock > 0 ? ' (mínimo ' + minStock + ')' : ''), unlimited || (Number.isInteger(stock) && stock! >= minStock)]])) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="st-name" required>Nome</Label>
          <Input id="st-name" placeholder="Ex.: Adesivo Carnaval 2027" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
          Estoque ilimitado (não controlar quantidade)
        </label>
        {!unlimited && (
          <div className="space-y-1.5"><Label htmlFor="st-qty" required>Quantidade em estoque</Label>
            <Input id="st-qty" type="number" min={minStock} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            {minStock > 0 && <p className="text-xs text-muted-foreground">Não pode ficar abaixo de {minStock}, que já estão reservadas em pedidos em andamento.</p>}</div>
        )}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={save.isPending} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /> Salvar</Button>
          <Button type="button" variant="outline" aria-label="Cancelar" title="Cancelar" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </form>
    </SheetContent>
  )
}

/** Estoque da loja, independente dos produtos: cada produto (e cada kit) escolhe quais itens consome. */
export function StockTab() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [sheet, setSheet] = useState<'new' | string | null>(null)
  const items = useQuery({ queryKey: ['shop', orgId, 'stock'], queryFn: () => listStockItems(orgId) })
  const products = useQuery({ queryKey: ['shop', orgId, 'products'], queryFn: () => listProducts(orgId) })

  const usedBy = new Map<string, string[]>()
  for (const p of (products.data ?? []).filter((x) => x.is_active)) {
    for (const v of p.shop_product_variants) {
      for (const u of v.shop_variant_stock ?? []) {
        const label = `${p.name}${p.shop_product_variants.length > 1 ? ` (${v.label})` : ''}${u.quantity > 1 ? ` · ${u.quantity} por unidade` : ''}`
        usedBy.set(u.stock_item_id, [...(usedBy.get(u.stock_item_id) ?? []), label])
      }
    }
  }

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateStockItem(id, { is_active: active }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['shop', orgId, 'stock'] }); toast.success(v.active ? 'Item restaurado.' : 'Item movido para a lixeira.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const list = (items.data ?? []).filter((i) => i.is_active)
  const paged = usePaged(list)
  const current = sheet && sheet !== 'new' ? items.data?.find((i) => i.id === sheet) ?? null : null

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Estoque</h2>
      <ButtonRow>
        <Button onClick={() => setSheet('new')}><Plus className="h-4 w-4" /> Novo item</Button>
      </ButtonRow>
      <p className="text-sm text-muted-foreground">Cadastre aqui o que você guarda. Ao criar um produto ou um kit, você escolhe quais itens ele consome: assim o avulso e o kit baixam o mesmo estoque.</p>
      {items.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {items.isError && <EmptyState>Não foi possível carregar o estoque.</EmptyState>}
      {items.data && list.length === 0 && <EmptyState>Nenhum item de estoque ainda. Crie o primeiro.</EmptyState>}
      {paged.visible.map((it) => {
        const uses = usedBy.get(it.id) ?? []
        const avail = availableUnits(it)
        return (
          <Card key={it.id} className="flex items-start gap-2 p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words font-semibold">{it.name}</p>
              {it.stock === null
                ? <p className="text-sm">Estoque ilimitado</p>
                : (
                  <div className="text-sm">
                    <p><strong>{it.stock}</strong> em estoque</p>
                    <p>{it.reserved} {plural(it.reserved, 'reservado', 'reservados')}</p>
                    <p><strong>{avail}</strong> {plural(avail, 'disponível', 'disponíveis')} {avail === 0 && <Badge>Esgotado</Badge>}</p>
                  </div>
                )}
              <p className="text-sm text-muted-foreground">{uses.length === 0 ? 'Nenhum produto usa este item ainda.' : `Usado em: ${uses.join('; ')}`}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Editar ${it.name}`} onClick={() => setSheet(it.id)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Mover ${it.name} para a lixeira`} title="Mover para a lixeira" onClick={async () => {
              if (uses.length > 0) return toast.error(`Ainda há produtos usando este item: ${uses.join('; ')}. Tire o item deles primeiro.`)
              if (await confirmBox('Mover este item para a lixeira? Você pode restaurar depois.')) setActive.mutate({ id: it.id, active: false })
            }}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        )
      })}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onClick={paged.more} />
      <TrashSection entries={(items.data ?? []).filter((i) => !i.is_active).map((i) => ({ id: i.id, name: i.name }))} onRestore={(id) => setActive.mutate({ id, active: true })} />
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet === 'new' && <ItemSheet key="new" item={null} minStock={0} onClose={() => setSheet(null)} />}
        {current && <ItemSheet key={current.id} item={current} minStock={current.reserved} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
