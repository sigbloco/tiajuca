import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useHoldReorder } from '@/core/holdReorder'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { fromCents, memberPriceCents, stockFromDb, stockToDb, toCents, validateProductDraft, type ProductKind } from '../catalog'
import { createProduct, deleteProductImage, imageUrl, reorderProductImages, setProductActive, updateProduct, uploadProductImage, type ShopProduct } from './service'

interface VariantRow { id?: string; label: string; stock: string; reserved: number; is_active: boolean }

const swapped = (imgs: { id: string }[], i: number, d: -1 | 1) => {
  const ids = imgs.map((x) => x.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]]
  return ids
}

const SIZES = ['P', 'M', 'G', 'GG']

export function ProductSheet({ product, defaultDiscount = 0, onSaved, onClose }: { product: ShopProduct | null; defaultDiscount?: number; onSaved: (id: string) => void; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: product?.name ?? '', description: product?.description ?? '', kind: (product?.kind ?? 'stock') as ProductKind,
    price: product ? fromCents(product.price_cents) : (null as number | null),
    discount: String(product?.member_discount_pct ?? defaultDiscount).replace('.', ','), leadTime: product?.lead_time_days ? String(product.lead_time_days) : '',
    is_active: product?.is_active ?? true, is_featured: product?.is_featured ?? false,
  })
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.shop_product_variants.map((v) => ({ id: v.id, label: v.label, stock: String(stockFromDb(v.stock)), reserved: v.reserved, is_active: v.is_active }))
      ?? [{ label: 'Único', stock: '0', reserved: 0, is_active: true }],
  )
  const [removed, setRemoved] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['shop', orgId, 'products'] })
  const isStock = f.kind === 'stock'
  const discount = Number(f.discount.replace(',', '.'))

  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        name: f.name, kind: f.kind, priceCents: f.price === null ? null : toCents(f.price), discountPct: discount,
        leadTimeDays: f.leadTime ? Number(f.leadTime) : null,
        variants: variants.map((v) => ({ label: v.label, stock: v.stock === '' ? null : Number(v.stock) })),
      }
      const errs = validateProductDraft(draft)
      // O estoque físico não pode ficar abaixo do que já está reservado por pedidos em andamento.
      if (isStock) {
        for (const [i, v] of variants.entries()) {
          const s = draft.variants[i].stock
          if (s !== null && s >= 0 && s < v.reserved) errs.push(`"${v.label}": há ${v.reserved} reservada(s) em pedidos; o estoque não pode ser menor.`)
        }
      }
      setErrors(errs)
      if (errs.length) return null
      const input = {
        name: f.name.trim(), description: f.description.trim(), price_cents: draft.priceCents!, member_discount_pct: discount,
        lead_time_days: isStock ? null : draft.leadTimeDays, is_active: f.is_active, is_featured: f.is_featured,
      }
      const rows = variants.map((v, i) => ({ id: v.id, label: v.label, stock: isStock ? stockToDb(draft.variants[i].stock as number) : null, is_active: v.is_active }))
      if (product) { await updateProduct(orgId, product.id, input, product.kind, rows, removed); return product.id }
      return createProduct(orgId, { ...input, kind: f.kind }, rows)
    },
    onSuccess: (id) => {
      if (!id) return
      refresh()
      toast.success(product ? 'Produto atualizado.' : 'Produto criado. Agora você pode adicionar as fotos.')
      if (product) onClose(); else onSaved(id)
    },
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
    return [...vs.filter((v) => v.label.trim() || v.id), ...SIZES.filter((s) => !have.has(s.toLowerCase())).map((label) => ({ label, stock: '0', reserved: 0, is_active: true }))]
  })

  const publicCents = f.price === null ? null : toCents(f.price)
  return (
    <SheetContent title={product ? 'Editar produto' : 'Novo produto'} description="Preço público, desconto de integrante, variações e fotos.">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="pr-name">Nome</Label>
          <Input id="pr-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pr-kind">Tipo</Label>
          <Select id="pr-kind" value={f.kind} disabled={!!product} onChange={(e) => {
            const kind = e.target.value as ProductKind
            setF({ ...f, kind })
            setVariants((vs) => vs.map((v) => ({ ...v, stock: kind === 'stock' ? (v.stock || '0') : '' })))
          }}>
            <option value="stock">Em estoque (controla quantidade)</option>
            <option value="made_to_order">Sob encomenda (prazo de produção)</option>
          </Select>
          {product && <p className="text-sm text-muted-foreground">O tipo não muda depois de criado.</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="pr-desc">Descrição</Label>
          <textarea id="pr-desc" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="grid grid-cols-2 gap-3">
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
          <div className="space-y-1.5"><Label htmlFor="pr-lead">Prazo de produção (dias)</Label>
            <Input id="pr-lead" inputMode="numeric" value={f.leadTime} onChange={(e) => setF({ ...f, leadTime: e.target.value.replace(/\D/g, '') })} /></div>
        )}

        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">{isStock ? 'Variações e estoque' : 'Variações'}</legend>
          {isStock && <p className="text-xs text-muted-foreground">Estoque de -1 a 99: -1 = ilimitado · 0 = esgotado.</p>}
          {variants.map((v, i) => (
            <div key={vKey(v, i)} {...dnd.row(vKey(v, i), dragVariant, 'variants')} className={`flex items-center gap-2 rounded-lg ${v.is_active ? '' : 'bg-muted/60 opacity-60'} ${dnd.cls(vKey(v, i))}`}>
              {dnd.handle(vKey(v, i), dragVariant, 'variants')}
              <div className="flex flex-col">
                <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir variação" disabled={i === 0} onClick={() => moveVariant(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer variação" disabled={i === variants.length - 1} onClick={() => moveVariant(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
              </div>
              <Input aria-label="Nome da variação" placeholder="Ex.: M" className={v.is_active ? '' : 'line-through'} value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} />
              {isStock && <Input aria-label={`Estoque de ${v.label || 'variação'}`} className="w-24" type="number" min={-1} max={99} step={1} title="-1 = ilimitado · 0 = esgotado" value={v.stock}
                onChange={(e) => setVariant(i, { stock: e.target.value === '' ? '' : String(Math.min(99, Math.max(-1, Math.trunc(Number(e.target.value))))) })} />}
              {product && isStock && v.reserved > 0 && <Badge title="Reservado em pedidos em andamento">{v.reserved} res.</Badge>}
              <Button type="button" size="icon" variant={v.is_active ? 'ghost' : 'outline'} aria-pressed={!v.is_active} title={v.is_active ? 'Desativar variação' : 'Variação desativada: clique para reativar'}
                aria-label={v.is_active ? 'Desativar variação' : 'Reativar variação'} className={v.is_active ? '' : 'border-destructive text-destructive'} onClick={() => setVariant(i, { is_active: !v.is_active })}><Ban className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Excluir variação" title="Excluir variação"
                onClick={() => { if (v.id) setRemoved((r) => [...r, v.id!]); setVariants((vs) => vs.filter((_, j) => j !== i)) }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setVariants((vs) => [...vs, { label: '', stock: isStock ? '0' : '', reserved: 0, is_active: true }])}><Plus className="h-4 w-4" /> Variação</Button>
            <Button type="button" size="sm" variant="outline" onClick={addSizes}>Adicionar P, M, G, GG</Button>
          </div>
        </fieldset>

        {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <Button type="submit" className="w-full" disabled={save.isPending}>{product ? 'Salvar' : 'Criar produto'}</Button>
      </form>

      {product ? (
        <div className="space-y-2">
          <p className="font-semibold">Fotos</p>
          <div className="grid grid-cols-3 gap-2">
            {product.shop_product_images.map((img, i, all) => (
              <div key={img.id} {...dnd.row(img.id, dragImage, 'images')} className={`relative rounded-lg ${dnd.cls(img.id)}`}>
                <img src={imageUrl(img.storage_path)} alt={img.alt || product.name} draggable={false} className="aspect-square w-full rounded-lg object-cover" />
                <Button type="button" size="icon" variant="outline" className="absolute right-1 top-1 h-7 w-7 bg-card" aria-label="Remover foto"
                  onClick={() => window.confirm('Remover esta foto?') && removeImage.mutate(img)}><Trash2 className="h-4 w-4" /></Button>
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
          <Button type="button" variant="ghost" className={product.is_active ? 'w-full text-destructive' : 'w-full'} disabled={toggle.isPending}
            onClick={() => (!product.is_active || window.confirm('Mover este produto para a lixeira? Ele sai da loja, os pedidos já feitos não mudam e você pode restaurar depois.')) && toggle.mutate()}>
            {product.is_active ? 'Mover para a lixeira' : 'Restaurar na loja'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">As fotos podem ser adicionadas logo depois de criar o produto.</p>
      )}
    </SheetContent>
  )
}
