import { supabase } from '@/core/supabase'
import { slugify, type ProductKind } from '../catalog'
import type { ScheduleSlot } from './schedule'
import { resizeImage } from './imageResize'

export interface ShopVariant { id: string; product_id: string; label: string; stock: number | null; reserved: number; sort_order: number; is_active: boolean; shop_variant_stock: VariantStockUse[] }
export interface VariantStockUse { id: string; variant_id: string; stock_item_id: string; quantity: number; sort_order: number }
export interface StockItem { id: string; name: string; stock: number | null; reserved: number; is_active: boolean; sort_order: number }
export interface ShopImage { id: string; product_id: string; storage_path: string; alt: string; sort_order: number }
export interface ShopProduct {
  id: string; slug: string; name: string; description: string; kind: ProductKind
  price_cents: number; member_discount_pct: number; lead_time_days: string | null; min_units: number | null; suggested_ids: string[]; is_active: boolean; is_featured: boolean; sort_order: number
  is_kit: boolean; kit_component_photos: boolean; is_hidden: boolean; shop_product_pickups: { id: string; pickup_point_id: string }[]
  shop_product_variants: ShopVariant[]; shop_product_images: ShopImage[]
}
export interface PickupPoint {
  id: string; name: string; address: string; opening_hours: string; schedule: ScheduleSlot[]; sort_order: number; is_active: boolean
  /** 'place' = lugar e horário; 'person' = combinar direto com uma pessoa. */
  kind: 'place' | 'person'; contact_name: string | null; contact_phone: string | null; place_address: string | null
}

export const IMAGE_BUCKET = 'shop-images'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp']

export const imageUrl = (path: string) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl

export async function listProducts(orgId: string) {
  const { data, error } = await supabase.from('shop_products')
    .select('*, shop_product_variants(*, shop_variant_stock(*)), shop_product_images(*), shop_product_pickups(*)').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return (data as ShopProduct[]).map((p) => ({
    ...p,
    shop_product_variants: [...p.shop_product_variants].sort((a, b) => a.sort_order - b.sort_order),
    shop_product_images: [...p.shop_product_images].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export interface ProductInput {
  name: string; description: string; kind: ProductKind; price_cents: number; member_discount_pct: number
  lead_time_days: string | null; min_units: number | null; suggested_ids: string[]; is_active: boolean; is_featured: boolean
  is_kit?: boolean; kit_component_photos?: boolean
}
export interface VariantInput { id?: string; label: string; items: { stock_item_id: string; quantity: number }[]; is_active: boolean }

const isUniqueViolation = (e: { code?: string } | null) => e?.code === '23505'

/** Cria o produto gerando o slug a partir do nome (acrescenta -2, -3 se já existir). */
export async function createProduct(orgId: string, input: ProductInput, variants: VariantInput[]): Promise<string> {
  const base = slugify(input.name)
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base : `${base}-${n}`.slice(0, 60)
    const { data, error } = await supabase.from('shop_products').insert({ ...input, organization_id: orgId, slug }).select('id').single()
    if (isUniqueViolation(error)) continue
    if (error) throw error
    const id = (data as { id: string }).id
    await saveVariants(orgId, id, input.kind, variants)
    return id
  }
  throw new Error('Não foi possível gerar um endereço único para o produto. Mude o nome.')
}

export async function updateProduct(orgId: string, id: string, input: Omit<ProductInput, 'kind'>, kind: ProductKind, variants: VariantInput[], removedIds: string[] = []) {
  const { error } = await supabase.from('shop_products').update(input).eq('id', id)
  if (error) throw error
  if (removedIds.length) {
    const del = await supabase.from('shop_product_variants').delete().in('id', removedIds).eq('product_id', id)
    if (del.error) {
      if (del.error.code === '23503') throw new Error('Esta variação já tem pedidos e não pode ser excluída. Desative-a com o botão de proibido.')
      throw del.error
    }
  }
  await saveVariants(orgId, id, kind, variants)
}

/** O estoque da variação é só um marcador alto: o estoque real está nos itens (ver migração do estoque independente). */
export const VARIANT_STOCK_REF = 1_000_000

async function saveVariants(orgId: string, productId: string, kind: ProductKind, variants: VariantInput[]) {
  for (const [i, v] of variants.entries()) {
    const base = { label: v.label.trim(), is_active: v.is_active, sort_order: i }
    let id = v.id
    if (id) {
      const { error } = await supabase.from('shop_product_variants').update(base).eq('id', id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('shop_product_variants')
        .insert({ ...base, stock: kind === 'stock' ? VARIANT_STOCK_REF : null, organization_id: orgId, product_id: productId }).select('id').single()
      if (error) throw error
      id = (data as { id: string }).id
    }
    if (kind === 'stock') await saveVariantStock(orgId, id, v.items)
  }
}

/** Troca os itens de estoque que a variação consome. O banco recusa se houver pedidos em andamento com ela. */
async function saveVariantStock(orgId: string, variantId: string, items: { stock_item_id: string; quantity: number }[]) {
  const { data, error } = await supabase.from('shop_variant_stock').select('stock_item_id, quantity').eq('variant_id', variantId)
  if (error) throw error
  const same = (data ?? []).length === items.length && items.every((it) => (data as typeof items).some((d) => d.stock_item_id === it.stock_item_id && d.quantity === it.quantity))
  if (same) return
  const del = await supabase.from('shop_variant_stock').delete().eq('variant_id', variantId)
  if (del.error) throw del.error
  if (items.length === 0) return
  const ins = await supabase.from('shop_variant_stock').insert(items.map((it, i) => ({ organization_id: orgId, variant_id: variantId, stock_item_id: it.stock_item_id, quantity: it.quantity, sort_order: i })))
  if (ins.error) throw ins.error
}

export async function listStockItems(orgId: string): Promise<StockItem[]> {
  const { data, error } = await supabase.from('shop_stock_items').select('*').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return data as StockItem[]
}

export async function createStockItem(orgId: string, name: string, stock: number | null) {
  const { error } = await supabase.from('shop_stock_items').insert({ organization_id: orgId, name: name.trim(), stock })
  if (error) throw error
}

export async function updateStockItem(id: string, patch: Partial<Pick<StockItem, 'name' | 'stock' | 'is_active'>>) {
  const { error } = await supabase.from('shop_stock_items').update(patch).eq('id', id)
  if (error) throw error
}

/** Pontos de retirada do produto (nenhum marcado = vale para todos). */
export async function saveProductPickups(orgId: string, productId: string, ids: string[]) {
  const del = await supabase.from('shop_product_pickups').delete().eq('product_id', productId)
  if (del.error) throw del.error
  if (ids.length === 0) return
  const { error } = await supabase.from('shop_product_pickups').insert(ids.map((pickup_point_id) => ({ organization_id: orgId, product_id: productId, pickup_point_id })))
  if (error) throw error
}

export async function setProductHidden(id: string, is_hidden: boolean) {
  const { error } = await supabase.from('shop_products').update({ is_hidden }).eq('id', id)
  if (error) throw error
}

export async function setProductActive(id: string, is_active: boolean) {
  const { error } = await supabase.from('shop_products').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function uploadProductImage(orgId: string, productId: string, file: File, sortOrder: number) {
  if (!IMAGE_MIME.includes(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('A imagem passa de 5 MB.')
  // A foto é reduzida (lado maior 900 px) e guardada em WebP: carrega rápido no celular.
  const small = await resizeImage(file)
  const path = `${orgId}/${productId}/${crypto.randomUUID()}.webp`
  const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, small, { contentType: 'image/webp', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.from('shop_product_images').insert({ organization_id: orgId, product_id: productId, storage_path: path, sort_order: sortOrder })
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path])
    throw error
  }
}

export async function deleteProductImage(image: ShopImage) {
  const { error } = await supabase.from('shop_product_images').delete().eq('id', image.id)
  if (error) throw error
  await supabase.storage.from(IMAGE_BUCKET).remove([image.storage_path])
}

export async function listPickupPoints(orgId: string) {
  const { data, error } = await supabase.from('shop_pickup_points').select('*').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return data as PickupPoint[]
}

export async function deletePickupPoint(id: string) {
  const { error } = await supabase.from('shop_pickup_points').delete().eq('id', id)
  if (error) throw error
}

export async function savePickupPoint(orgId: string, id: string | null, row: Omit<PickupPoint, 'id' | 'sort_order'> & { sort_order?: number }) {
  const q = id
    ? supabase.from('shop_pickup_points').update(row).eq('id', id)
    : supabase.from('shop_pickup_points').insert({ ...row, organization_id: orgId })
  const { error } = await q
  if (error) throw error
}


/** Grava a nova ordem das fotos de um produto (índice na lista = sort_order). */
export async function reorderProductImages(ids: string[]) {
  const results = await Promise.all(ids.map((id, i) => supabase.from('shop_product_images').update({ sort_order: i }).eq('id', id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

/** Grava a nova ordem de exibição dos produtos (índice na lista = sort_order). */
export async function reorderProducts(orgId: string, ids: string[]) {
  const results = await Promise.all(ids.map((id, i) => supabase.from('shop_products').update({ sort_order: i }).eq('id', id).eq('organization_id', orgId)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

