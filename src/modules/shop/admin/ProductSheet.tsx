import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Copy, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, ImagePlus, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProgressive } from '@/components/shared/LoadMore'
import { useHoldReorder } from '@/core/holdReorder'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { fromCents, memberPriceCents, toCents, validateProductDraft, type ProductKind } from '../catalog'
import { IMAGE_MIME, MAX_IMAGE_BYTES, createProduct, duplicateProduct, deleteProductImage, imageUrl, reorderProductImages, productHasOrders, saveProductPickups, setProductActive, setProductHidden, updateProduct, uploadProductImage, type PickupPoint, type ShopProduct, type StockItem } from './service'

interface Use { stock_item_id: string; quantity: string }
interface VariantRow { id?: string; label: string; uses: Use[]; reserved: number; is_active: boolean }

/** Itens de estoque que a variação consome por unidade vendida (kit = vários itens). */
function UsesEditor({ uses, items, locked, onChange }: { uses: Use[]; items: StockItem[]; locked: boolean; onChange: (u: Use[]) => void }) {
  const set = (i: number, patch: Partial<Use>) => onChange(uses.map((u, j) => (j === i ? { ...u, ...patch } : u)))
  return (
    <div className="space-y-1.5 pl-1">
      {uses.map((u, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input aria-label="Quantidade do item por unidade vendida" className="w-16" type="number" min={1} max={50} disabled={locked} value={u.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
          <span aria-hidden>×</span>
          <Select aria-label="Item de estoque" className="min-w-0 flex-1" disabled={locked} value={u.stock_item_id} onChange={(e) => set(i, { stock_item_id: e.target.value })}>
            <option value="">Escolha o item de estoque</option>
            {items.filter((it) => it.is_active || it.id === u.stock_item_id).map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </Select>
          <Button type="button" size="icon" variant="ghost" aria-label="Tirar item" title="Tirar item" disabled={locked} onClick={() => onChange(uses.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => onChange([...uses, { stock_item_id: '', quantity: '1' }])}><Plus className="h-4 w-4" /> Item de estoque</Button>
    </div>
  )
}

const swapped = (imgs: { id: string }[], i: number, d: -1 | 1) => {
  const ids = imgs.map((x) => x.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]]
  return ids
}

const SIZES = ['P', 'M', 'G', 'GG']

/** Salvar, ocultar e apagar dividem a largura por igual; com espaço mostram o texto, senão só o ícone. */
function ActionBar({ product, saving, hiding, trashing, onHide, onTrash }: {
  product: { is_hidden: boolean; is_active: boolean } | null
  saving: boolean; hiding: boolean; trashing: boolean; onHide: () => void; onTrash: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const count = product ? 3 : 1
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCompact(el.clientWidth / count < 112)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [count])
  const label = (text: string) => (compact ? null : <span>{text}</span>)
  const hiddenNow = product?.is_hidden ?? false
  return (
    <div ref={ref} role="toolbar" aria-label="Ações do produto" className="flex w-full items-center gap-2 py-1.5">
      <Button type="submit" form="product-form" className="min-w-0 flex-1" aria-label="Salvar" title="Salvar" disabled={saving}><Save className="h-4 w-4" />{label('Salvar')}</Button>
      {product && (
        <>
          <Button type="button" variant="outline" className={`min-w-0 flex-1 ${hiddenNow ? 'border-destructive text-destructive' : ''}`} aria-pressed={hiddenNow} disabled={hiding} onClick={onHide}
            aria-label={hiddenNow ? 'Exibir na loja' : 'Ocultar'} title={hiddenNow ? 'Exibir na loja' : 'Ocultar: some da loja, mas continua na lista'}>
            {hiddenNow ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{label(hiddenNow ? 'Exibir' : 'Ocultar')}
          </Button>
          <Button type="button" variant="outline" className={`min-w-0 flex-1 ${product.is_active ? 'text-destructive' : ''}`} disabled={trashing} onClick={onTrash}
            aria-label={product.is_active ? 'Apagar (mover para a lixeira)' : 'Restaurar na loja'} title={product.is_active ? 'Apagar: move para a lixeira' : 'Restaurar na loja'}>
            <Trash2 className="h-4 w-4" />{label(product.is_active ? 'Apagar' : 'Restaurar')}
          </Button>
        </>
      )}
    </div>
  )
}


export function ProductSheet({ product, kit = false, others = [], stockItems = [], pickupPoints = [], defaultDiscount = 0, onSaved, onClose }: { product: ShopProduct | null; kit?: boolean; others?: ShopProduct[]; stockItems?: StockItem[]; pickupPoints?: PickupPoint[]; defaultDiscount?: number; onSaved: (id: string) => void; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: product?.name ?? '', description: product?.description ?? '', kind: (product?.kind ?? 'stock') as ProductKind,
    price: product ? fromCents(product.price_cents) : (null as number | null),
    discount: String(product?.member_discount_pct ?? defaultDiscount).replace('.', ','), leadTime: product?.lead_time_days ?? '', minUnits: product?.min_units ? String(product.min_units) : '', suggested: product?.suggested_ids ?? ([] as string[]),
    is_active: product?.is_active ?? true, is_featured: product?.is_featured ?? false,
  })
  const isKit = product ? product.is_kit : kit
  const [pickups, setPickups] = useState<string[]>(product?.shop_product_pickups?.map((x) => x.pickup_point_id) ?? [])
  const [photos, setPhotos] = useState(product?.kit_component_photos ?? true)
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.shop_product_variants.map((v) => ({
      id: v.id, label: v.label, reserved: v.reserved, is_active: v.is_active,
      uses: [...(v.shop_variant_stock ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((u) => ({ stock_item_id: u.stock_item_id, quantity: String(u.quantity) })),
    })) ?? [{ label: 'Único', uses: [{ stock_item_id: '', quantity: '1' }], reserved: 0, is_active: true }],
  )
  const [removed, setRemoved] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // Produto novo: as fotos escolhidas ficam na tela e são enviadas junto com o salvar.
  const pendingRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[]>([])
  const previews = useMemo(() => pending.map((file) => URL.createObjectURL(file)), [pending])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  const addPending = (files: File[]) => {
    const ok = files.filter((file) => {
      if (!IMAGE_MIME.includes(file.type)) { toast.error(`"${file.name}": use uma imagem PNG, JPG ou WebP.`); return false }
      if (file.size > MAX_IMAGE_BYTES) { toast.error(`"${file.name}" passa de 5 MB.`); return false }
      return true
    })
    if (ok.length) setPending((cur) => [...cur, ...ok])
  }
  const sendPending = async (id: string) => {
    let failed = 0
    for (const [i, file] of pending.entries()) { try { await uploadProductImage(orgId, id, file, i) } catch { failed++ } }
    if (failed) toast.error(`${failed} foto(s) não puderam ser enviadas. Adicione de novo na edição.`)
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['shop', orgId, 'products'] })
  const isStock = f.kind === 'stock'
  const discount = Number(f.discount.replace(',', '.'))

  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        name: f.name, kind: f.kind, priceCents: f.price === null ? null : toCents(f.price), discountPct: discount,
        leadTimeDays: f.leadTime.trim() || null,
        variants: variants.map((v) => ({ label: v.label, items: v.uses.filter((u) => u.stock_item_id).length })),
      }
      const errs = validateProductDraft(draft)
      if (isStock) {
        for (const v of variants) {
          const ids = v.uses.map((u) => u.stock_item_id).filter(Boolean)
          if (new Set(ids).size !== ids.length) errs.push(`"${v.label || 'Variação'}": há um item de estoque repetido. Some as quantidades numa linha só.`)
          if (v.uses.some((u) => u.stock_item_id && !(Number.isInteger(Number(u.quantity)) && Number(u.quantity) >= 1 && Number(u.quantity) <= 50))) errs.push('A quantidade de cada item deve ficar entre 1 e 50.')
        }
      }
      setErrors(errs)
      if (errs.length) return null
      const input = {
        name: f.name.trim(), description: f.description.trim(), price_cents: draft.priceCents!, member_discount_pct: discount,
        lead_time_days: isStock ? null : draft.leadTimeDays, min_units: isStock || !f.minUnits ? null : Number(f.minUnits), suggested_ids: f.suggested.filter((id) => id !== product?.id), is_active: f.is_active, is_featured: f.is_featured,
        ...(isKit ? { is_kit: true, kit_component_photos: photos } : {}),
      }
      const rows = variants.map((v) => ({ id: v.id, label: v.label, is_active: v.is_active, items: v.uses.filter((u) => u.stock_item_id).map((u) => ({ stock_item_id: u.stock_item_id, quantity: Number(u.quantity) })) }))
      if (product) { await updateProduct(orgId, product.id, input, f.kind, rows, removed, product.kind); await saveProductPickups(orgId, product.id, pickups); return product.id }
      const created = await createProduct(orgId, { ...input, kind: f.kind }, rows)
      await saveProductPickups(orgId, created, pickups)
      await sendPending(created)
      return created
    },
    onSuccess: (id) => {
      if (!id) return
      refresh()
      toast.success(product ? (isKit ? 'Kit atualizado.' : 'Produto atualizado.') : (isKit ? 'Kit criado.' : 'Produto criado.'))
      if (product) onClose(); else onSaved(id)
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const dup = useMutation({
    mutationFn: () => duplicateProduct(orgId, product!),
    onSuccess: (id) => { refresh(); toast.success('Produto duplicado. A cópia está oculta na loja: ajuste o nome e o que mudar e use Exibir.'); onSaved(id) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  // O tipo só muda enquanto o produto nunca teve pedido.
  const orders = useQuery({ queryKey: ['shop', orgId, 'product-orders', product?.id], queryFn: () => productHasOrders(product!.id), enabled: !!product })
  const kindLocked = !!product && orders.data !== false
  const hide = useMutation({
    mutationFn: () => setProductHidden(product!.id, !product!.is_hidden),
    onSuccess: () => { refresh(); toast.success(product!.is_hidden ? 'Produto exibido na loja.' : 'Produto oculto: não aparece na loja, mas continua na lista.'); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: () => setProductActive(product!.id, !product!.is_active),
    onSuccess: () => { refresh(); toast.success(product!.is_active ? 'Produto movido para a lixeira.' : 'Produto restaurado na loja.'); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const start = product!.shop_product_images.length
      for (const [i, file] of files.entries()) await uploadProductImage(orgId, product!.id, file, start + i)
    },
    onSuccess: () => { refresh(); toast.success('Foto enviada.') },
    onError: (e) => { refresh(); toast.error(friendlyError(e)) },
  })
  const removeImage = useMutation({
    mutationFn: deleteProductImage,
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })

  const dnd = useHoldReorder()
  const varProg = useProgressive(variants, 5)
  const vKey = (v: VariantRow, i: number) => v.id ?? `n${i}`
  const dragVariant = (from: string, to: string) => setVariants((vs) => {
    const keys = vs.map(vKey), a = keys.indexOf(from), b = keys.indexOf(to)
    if (a < 0 || b < 0) return vs
    const next = [...vs]
    next.splice(b, 0, next.splice(a, 1)[0])
    return next
  })
  const dragImage = (from: string, to: string) => {
    const ids = product!.shop_product_images.map((x) => x.id), a = ids.indexOf(from), b = ids.indexOf(to)
    if (a < 0 || b < 0) return
    ids.splice(b, 0, ids.splice(a, 1)[0])
    moveImage.mutate({ ids })
  }
  const moveVariant = (i: number, d: -1 | 1) => setVariants((vs) => {
    const j = i + d
    if (j < 0 || j >= vs.length) return vs
    const next = [...vs];
    [next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const moveImage = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      await reorderProductImages(ids)
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  const setVariant = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const addSizes = () => setVariants((vs) => {
    const have = new Set(vs.map((v) => v.label.trim().toLowerCase()))
    return [...vs.filter((v) => v.label.trim() || v.id), ...SIZES.filter((s) => !have.has(s.toLowerCase())).map((label) => ({ label, uses: [{ stock_item_id: '', quantity: '1' }], reserved: 0, is_active: true }))]
  })

  const publicCents = f.price === null ? null : toCents(f.price)
  const actionBar = (
    <ActionBar saving={save.isPending} hiding={hide.isPending} trashing={toggle.isPending}
      product={product ? { is_hidden: product.is_hidden, is_active: product.is_active } : null}
      onHide={() => hide.mutate()}
      onTrash={async () => { if (!product?.is_active || await confirmBox('Mover este produto para a lixeira? Ele sai da loja, os pedidos já feitos não mudam e você pode restaurar depois.')) toggle.mutate() }} />
  )
  const topSlot = typeof document === 'undefined' ? null : document.getElementById('edit-actions-slot')
  return (
    <SheetContent titleAction={product ? <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Duplicar" title="Duplicar: cria uma cópia para você ajustar" disabled={dup.isPending} onClick={() => dup.mutate()}><Copy className="h-4 w-4" /></Button> : undefined} title={isKit ? (product ? 'Editar kit' : 'Novo kit') : (product ? 'Editar produto' : 'Novo produto')} description={isKit ? 'Preço do kit, itens de estoque que entram nele e fotos.' : 'Preço público, desconto de integrante, variações, estoque e fotos.'}>
      {topSlot ? createPortal(actionBar, topSlot) : actionBar}
      <form id="product-form" onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="pr-name">Nome</Label>
          <Input id="pr-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        {!isKit && <div className="space-y-1.5"><Label htmlFor="pr-kind">Tipo</Label>
          <Select id="pr-kind" value={f.kind} disabled={kindLocked} onChange={(e) => {
            const kind = e.target.value as ProductKind
            setF({ ...f, kind })
            setVariants((vs) => vs.map((v) => ({ ...v, uses: kind === 'stock' ? (v.uses.length ? v.uses : [{ stock_item_id: '', quantity: '1' }]) : [] })))
          }}>
            <option value="stock">Em estoque (controla quantidade)</option>
            <option value="made_to_order">Sob encomenda (prazo de produção)</option>
          </Select>
          {product && <p className="text-sm text-muted-foreground">{orders.isLoading ? 'Conferindo se o produto já teve pedidos.' : orders.data === false ? 'Este produto nunca teve pedido, então o tipo ainda pode mudar.' : 'O tipo não muda porque o produto já teve pedidos.'}</p>}</div>}
        <div className="space-y-1.5"><Label htmlFor="pr-desc">Descrição</Label>
          <textarea id="pr-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="space-y-1.5"><Label htmlFor="pr-price">Preço público</Label><MoneyInput id="pr-price" value={f.price} onChange={(v) => setF({ ...f, price: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-disc">Desconto de integrante (%)</Label>
            <Input id="pr-disc" inputMode="decimal" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
        </div>
        {publicCents !== null && discount > 0 && discount <= 100 && (
          <p className="text-sm text-muted-foreground">Integrante ativo paga {formatCurrency(fromCents(memberPriceCents(publicCents, discount)))}.</p>
        )}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4" checked={f.is_featured} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} />
          Produto em destaque (aparece na seção do alto da loja)
        </label>
        {!isStock && (
          <div className="space-y-1.5"><Label htmlFor="pr-lead">Prazo de produção</Label>
            <Input id="pr-lead" placeholder="Ex.: 10-15 dias úteis" value={f.leadTime} onChange={(e) => setF({ ...f, leadTime: e.target.value })} /></div>
        )}
        {!isStock && (
          <div className="space-y-1.5"><Label htmlFor="pr-min">Mínimo para produzir (opcional)</Label>
            <Input id="pr-min" inputMode="numeric" placeholder="Ex.: 50" value={f.minUnits} onChange={(e) => setF({ ...f, minUnits: e.target.value.replace(/\D/g, '') })} />
            <p className="text-xs text-muted-foreground">Se preencher, a loja mostra quantas unidades já foram pagas até chegar nesse mínimo, e o prazo de produção só conta depois disso. Deixe vazio para não usar.</p></div>
        )}
        {pickupPoints.length > 0 && (
          <fieldset className="space-y-1 rounded-lg border border-border p-3">
            <legend className="px-1 font-semibold">Pontos de retirada</legend>
            <p className="text-xs text-muted-foreground">Marque onde este produto pode ser retirado (mais de um). Nenhum marcado = todos os pontos. No carrinho só aparecem os pontos comuns a todos os itens.</p>
            {pickupPoints.map((pt) => (
              <label key={pt.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={pickups.includes(pt.id)}
                  onChange={(e) => setPickups(e.target.checked ? [...pickups, pt.id] : pickups.filter((id) => id !== pt.id))} />
                {pt.name}
              </label>
            ))}
          </fieldset>
        )}
        {others.length > 0 && (
          <fieldset className="space-y-1 rounded-lg border border-border p-3">
            <legend className="px-1 font-semibold">Produtos sugeridos</legend>
            <p className="text-xs text-muted-foreground">Aparecem pequenos embaixo da página deste produto e do carrinho.</p>
            {others.filter((o) => o.is_active).map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={f.suggested.includes(o.id)}
                  onChange={(e) => setF({ ...f, suggested: e.target.checked ? [...f.suggested, o.id] : f.suggested.filter((id) => id !== o.id) })} />
                {o.name}
              </label>
            ))}
          </fieldset>
        )}

        {isKit && (
          <fieldset className="space-y-2 rounded-lg border border-border p-3">
            <legend className="px-1 font-semibold">O que vem no kit</legend>
            <p className="text-xs text-muted-foreground">Escolha os itens do estoque e quantos de cada vão em um kit. Vender um kit baixa esses itens, os mesmos dos produtos avulsos.</p>
            {(variants[0]?.reserved ?? 0) > 0 && <p role="alert" className="text-sm text-destructive">Há pedidos em andamento com este kit. Os itens só podem mudar depois que forem retirados ou cancelados.</p>}
            <UsesEditor uses={variants[0]?.uses ?? []} items={stockItems} locked={(variants[0]?.reserved ?? 0) > 0} onChange={(u) => setVariant(0, { uses: u })} />
            <label className="flex items-center gap-2 pt-1 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
              Incluir também as fotos dos produtos avulsos que usam esses itens
            </label>
          </fieldset>
        )}
        {!isKit && <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">{isStock ? 'Variações e estoque' : 'Variações'}</legend>
          {isStock && <p className="text-xs text-muted-foreground">Cada variação consome itens do estoque (cadastrados na aba Estoque). Ex.: o tamanho M usa 1 × Camiseta M.</p>}
          {varProg.visible.map((v, i) => (
            <div key={vKey(v, i)} className="space-y-1">
            <div {...dnd.row(vKey(v, i), dragVariant, 'variants')} className={`flex items-center gap-2 rounded-lg ${v.is_active ? '' : 'bg-muted/60 opacity-60'} ${dnd.cls(vKey(v, i))}`}>
              {dnd.handle(vKey(v, i), dragVariant, 'variants')}
              <div className="flex flex-col">
                <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir variação" disabled={i === 0} onClick={() => moveVariant(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer variação" disabled={i === variants.length - 1} onClick={() => moveVariant(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
              </div>
              <Input aria-label="Nome da variação" placeholder="Ex.: M" className={v.is_active ? '' : 'line-through'} value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} />
              <Button type="button" size="icon" variant={v.is_active ? 'ghost' : 'outline'} aria-pressed={!v.is_active} title={v.is_active ? 'Desativar variação' : 'Variação desativada: clique para reativar'}
                aria-label={v.is_active ? 'Desativar variação' : 'Reativar variação'} className={v.is_active ? '' : 'border-destructive text-destructive'} onClick={() => setVariant(i, { is_active: !v.is_active })}><Ban className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Excluir variação" title="Excluir variação"
                onClick={() => { if (v.id) setRemoved((r) => [...r, v.id!]); setVariants((vs) => vs.filter((_, j) => j !== i)) }}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {isStock && <UsesEditor uses={v.uses} items={stockItems} locked={v.reserved > 0} onChange={(u) => setVariant(i, { uses: u })} />}
            {isStock && v.reserved > 0 && <p className="pl-1 text-xs text-muted-foreground">{v.reserved} reservada(s) em pedidos em andamento: os itens só mudam depois que forem retirados ou cancelados.</p>}
            </div>
          ))}
          {varProg.button}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { varProg.showAll(); setVariants((vs) => [...vs, { label: '', uses: isStock ? [{ stock_item_id: '', quantity: '1' }] : [], reserved: 0, is_active: true }]) }}><Plus className="h-4 w-4" /> Variação</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { varProg.showAll(); addSizes() }}>Adicionar P, M, G, GG</Button>
          </div>
        </fieldset>}

        {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </form>

      {product ? (
        <div className="space-y-2">
          <p className="font-semibold">Fotos</p>
          <div className="grid grid-cols-3 gap-2">
            {product.shop_product_images.map((img, i, all) => (
              <div key={img.id} {...dnd.row(img.id, dragImage, 'images')} className={`relative rounded-lg ${dnd.cls(img.id)}`}>
                <img src={imageUrl(img.storage_path)} alt={img.alt || product.name} draggable={false} className="aspect-square w-full rounded-lg object-contain bg-muted" />
                <Button type="button" size="icon" variant="outline" className="absolute right-1 top-1 h-7 w-7 bg-card" aria-label="Remover foto"
                  onClick={async () => await confirmBox('Remover esta foto?') && removeImage.mutate(img)}><Trash2 className="h-4 w-4" /></Button>
                <div className="absolute bottom-1 left-1 flex gap-1">
                  <Button type="button" size="icon" variant="outline" className="h-7 w-7 bg-card" aria-label="Mover foto para antes" disabled={i === 0 || moveImage.isPending} onClick={() => moveImage.mutate({ ids: swapped(all, i, -1) })}><ArrowLeft className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="outline" className="h-7 w-7 bg-card" aria-label="Mover foto para depois" disabled={i === all.length - 1 || moveImage.isPending} onClick={() => moveImage.mutate({ ids: swapped(all, i, 1) })}><ArrowRight className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) upload.mutate(files) }} />
          <Button type="button" variant="outline" className="w-full" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {upload.isPending ? 'Enviando' : 'Adicionar fotos'}
          </Button>
          {actionBar}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="font-semibold">Fotos</p>
          {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {previews.map((src, i) => (
                <div key={src} className="relative rounded-lg">
                  <img src={src} alt={`Foto ${i + 1} a enviar`} className="aspect-square w-full rounded-lg object-contain bg-muted" />
                  <Button type="button" size="icon" variant="outline" className="absolute right-1 top-1 h-7 w-7 bg-card" aria-label="Tirar foto"
                    onClick={() => setPending((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
          <input ref={pendingRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) addPending(files) }} />
          <Button type="button" variant="outline" className="w-full" onClick={() => pendingRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Adicionar fotos
          </Button>
          <p className="text-xs text-muted-foreground">As fotos são enviadas quando você salvar, e depois você pode reordenar.</p>
          {actionBar}
        </div>
      )}
    </SheetContent>
  )
}
