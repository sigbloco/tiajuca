import { supabase } from '@/core/supabase'
import { slugify, type ProductKind } from '../catalog'
import type { ScheduleSlot } from './schedule'

export interface ShopVariant { id: string; product_id: string; label: string; stock: number | null; reserved: number; sort_order: number; is_active: boolean }
export interface ShopImage { id: string; product_id: string; storage_path: string; alt: string; sort_order: number }
export interface ShopProduct {
  id: string; slug: string; name: string; description: string; kind: ProductKind
  price_cents: number; member_discount_pct: number; lead_time_days: number | null; is_active: boolean; sort_order: number
  shop_product_variants: ShopVariant[]; shop_product_images: ShopImage[]
}
export interface PickupPoint { id: string; name: string; address: string; opening_hours: string; schedule: ScheduleSlot[]; sort_order: number; is_active: boolean }

export const IMAGE_BUCKET = 'shop-images'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp']

export const imageUrl = (path: string) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl

export async function listProducts(orgId: string) {
  const { data, error } = await supabase.from('shop_products')
    .select('*, shop_product_variants(*), shop_product_images(*)').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return (data as ShopProduct[]).map((p) => ({
    ...p,
    shop_product_variants: [...p.shop_product_variants].sort((a, b) => a.sort_order - b.sort_order),
    shop_product_images: [...p.shop_product_images].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export interface ProductInput {
  name: string; description: string; kind: ProductKind; price_cents: number; member_discount_pct: number
  lead_time_days: number | null; is_active: boolean
}
export interface VariantInput { id?: string; label: string; stock: number | null; is_active: boolean }

const isUniqueViolation = (e: { code?: string } | null) => e?.code === '23505'

/** Cria o produto gerando o slug a partir do nome (acrescenta -2, -3… se já existir). */
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

export async function updateProduct(orgId: string, id: string, input: Omit<ProductInput, 'kind'>, kind: ProductKind, variants: VariantInput[]) {
  const { error } = await supabase.from('shop_products').update(input).eq('id', id)
  if (error) throw error
  await saveVariants(orgId, id, kind, variants)
}

async function saveVariants(orgId: string, productId: string, kind: ProductKind, variants: VariantInput[]) {
  for (const [i, v] of variants.entries()) {
    const row = { label: v.label.trim(), stock: kind === 'stock' ? v.stock : null, is_active: v.is_active, sort_order: i }
    const q = v.id
      ? supabase.from('shop_product_variants').update(row).eq('id', v.id)
      : supabase.from('shop_product_variants').insert({ ...row, organization_id: orgId, product_id: productId })
    const { error } = await q
    if (error) throw error
  }
}

export async function setProductActive(id: string, is_active: boolean) {
  const { error } = await supabase.from('shop_products').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function uploadProductImage(orgId: string, productId: string, file: File, sortOrder: number) {
  if (!IMAGE_MIME.includes(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('A imagem passa de 5 MB.')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${orgId}/${productId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
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

