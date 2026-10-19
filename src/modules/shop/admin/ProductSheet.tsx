import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { fromCents, memberPriceCents, toCents, validateProductDraft, type ProductKind } from '../catalog'
import { createProduct, deleteProductImage, imageUrl, setProductActive, updateProduct, uploadProductImage, type ShopProduct } from './service'

interface VariantRow { id?: string; label: string; stock: string; reserved: number; is_active: boolean }

const SIZES = ['P', 'M', 'G', 'GG']

export function ProductSheet({ product, defaultDiscount = 0, onSaved, onClose }: { product: ShopProduct | null; defaultDiscount?: number; onSaved: (id: string) => void; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: product?.name ?? '', description: product?.description ?? '', kind: (product?.kind ?? 'stock') as ProductKind,
    price: product ? fromCents(product.price_cents) : (null as number | null),
    discount: String(product?.member_discount_pct ?? defaultDiscount).replace('.', ','), leadTime: product?.lead_time_days ? String(product.lead_time_days) : '',
    is_active: product?.is_active ?? true,
  })
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.shop_product_variants.map((v) => ({ id: v.id, label: v.label, stock: v.stock === null ? '' : String(v.stock), reserved: v.reserved, is_active: v.is_active }))
      ?? [{ label: 'Único', stock: '0', reserved: 0, is_active: true }],
  )
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
          if (s !== null && s < v.reserved) errs.push(`"${v.label}": há ${v.reserved} reservada(s) em pedidos; o estoque não pode ser menor.`)
        }
      }
      setErrors(errs)
      if (errs.length) return null
      const input = {
        name: f.name.trim(), description: f.description.trim(), price_cents: draft.priceCents!, member_discount_pct: discount,
        lead_time_days: isStock ? null : draft.leadTimeDays, is_active: f.is_active,
      }
      const rows = variants.map((v, i) => ({ id: v.id, label: v.label, stock: draft.variants[i].stock, is_active: v.is_active }))
      if (product) { await updateProduct(orgId, product.id, input, product.kind, rows); return product.id }
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
    onSuccess: () => { refresh(); toast.success(product!.is_active ? 'Produto escondido da loja.' : 'Produto publicado na loja.'); onClose() },
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
        {!isStock && (
          <div className="space-y-1.5"><Label htmlFor="pr-lead">Prazo de produção (dias)</Label>
            <Input id="pr-lead" inputMode="numeric" value={f.leadTime} onChange={(e) => setF({ ...f, leadTime: e.target.value.replace(/\D/g, '') })} /></div>
        )}

        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">{isStock ? 'Variações e estoque' : 'Variações'}</legend>
          {variants.map((v, i) => (
            <div key={v.id ?? `n${i}`} className="flex items-center gap-2">
              <Input aria-label="Nome da variação" placeholder="Ex.: M" value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} />
              {isStock && <Input aria-label={`Estoque de ${v.label || 'variação'}`} className="w-24" inputMode="numeric" placeholder="Qtd" value={v.stock}
                onChange={(e) => setVariant(i, { stock: e.target.value.replace(/\D/g, '') })} />}
              {product && isStock && v.reserved > 0 && <Badge title="Reservado em pedidos em andamento">{v.reserved} res.</Badge>}
              {v.id
                ? <Button type="button" size="sm" variant="outline" onClick={() => setVariant(i, { is_active: !v.is_active })}>{v.is_active ? 'Ativa' : 'Oculta'}</Button>
                : <Button type="button" size="icon" variant="ghost" aria-label="Remover variação" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
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
            {product.shop_product_images.map((img) => (
              <div key={img.id} className="relative">
                <img src={imageUrl(img.storage_path)} alt={img.alt || product.name} className="aspect-square w-full rounded-lg object-cover" />
                <Button type="button" size="icon" variant="outline" className="absolute right-1 top-1 h-7 w-7 bg-card" aria-label="Remover foto"
                  onClick={() => window.confirm('Remover esta foto?') && removeImage.mutate(img)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) upload.mutate(files) }} />
          <Button type="button" variant="outline" className="w-full" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> {upload.isPending ? 'Enviando…' : 'Adicionar fotos'}
          </Button>
          <Button type="button" variant="ghost" className={product.is_active ? 'w-full text-destructive' : 'w-full'} disabled={toggle.isPending}
            onClick={() => (!product.is_active || window.confirm('Esconder da loja? Pedidos já feitos não mudam.')) && toggle.mutate()}>
            {product.is_active ? 'Esconder da loja' : 'Publicar na loja'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">As fotos podem ser adicionadas logo depois de criar o produto.</p>
      )}
    </SheetContent>
  )
}
