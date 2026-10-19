import { supabase } from '@/core/supabase'
import type { ProductKind } from '../catalog'
import type { FulfillmentStatus, OrderStatus } from '../orders/transitions'

export interface OrderItem { id: string; product_name: string; variant_label: string; kind: ProductKind; quantity: number; unit_price_cents: number; unit_final_cents: number; discount_pct: number }
export interface Fulfillment { id: string; kind: ProductKind; status: FulfillmentStatus; updated_at: string }
export interface AdminOrder {
  id: string; code: string; status: OrderStatus; payment_method: 'pix' | 'infinitepay'
  customer_name: string; customer_phone: string; customer_email: string; member_id: string | null; pickup_point_id: string
  subtotal_cents: number; discount_cents: number; total_cents: number
  created_at: string; expires_at: string | null; paid_at: string | null; paid_via: 'manual' | 'webhook' | null; cancel_reason: string | null
  payment_ref: Record<string, unknown>; archived_at: string | null
  shop_order_items: OrderItem[]; shop_fulfillments: Fulfillment[]
}
export interface OrderEvent { id: string; scope: 'order' | 'fulfillment'; from_status: string | null; to_status: string; actor_label: string; note: string | null; created_at: string }

export interface OrderFilters { status: OrderStatus | 'all'; method: 'pix' | 'infinitepay' | 'all'; pickup: string; archive: 'active' | 'archived' | 'all' }
export const EMPTY_ORDER_FILTERS: OrderFilters = { status: 'all', method: 'all', pickup: 'all', archive: 'active' }
export const ORDERS_LIMIT = 200

export async function listOrders(orgId: string, f: OrderFilters) {
  let q = supabase.from('shop_orders').select('*, shop_order_items(*), shop_fulfillments(*)').eq('organization_id', orgId)
    .order('created_at', { ascending: false }).limit(ORDERS_LIMIT)
  if (f.status !== 'all') q = q.eq('status', f.status)
  if (f.method !== 'all') q = q.eq('payment_method', f.method)
  if (f.pickup !== 'all') q = q.eq('pickup_point_id', f.pickup)
  if (f.archive === 'active') q = q.is('archived_at', null)
  else if (f.archive === 'archived') q = q.not('archived_at', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return data as AdminOrder[]
}

export async function listOrderEvents(orderId: string) {
  const { data, error } = await supabase.from('shop_order_events').select('id, scope, from_status, to_status, actor_label, note, created_at')
    .eq('order_id', orderId).order('created_at')
  if (error) throw error
  return data as OrderEvent[]
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}
export const markPaid = (orderId: string) => rpc('shop_admin_mark_paid', { p_order: orderId })
export const setFulfillment = (orderId: string, kind: ProductKind, status: FulfillmentStatus) =>
  rpc('shop_admin_set_fulfillment', { p_order: orderId, p_kind: kind, p_status: status })
export const cancelOrder = (orderId: string, reason: string) => rpc('shop_admin_cancel_order', { p_order: orderId, p_reason: reason })
export const archiveOrder = (orderId: string, archive: boolean) => rpc('shop_admin_archive_order', { p_order: orderId, p_archive: archive })
export const archiveFinished = (orgId: string) => rpc('shop_admin_archive_finished', { p_org: orgId }) as Promise<number>
export const reactivateOrder = (orderId: string) => rpc('shop_admin_reactivate_order', { p_order: orderId })

/** Busca livre na lista já carregada: código, nome, telefone (só dígitos) ou e-mail. */
export function matchesOrder(o: Pick<AdminOrder, 'code' | 'customer_name' | 'customer_phone' | 'customer_email'>, text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return true
  const digits = t.replace(/\D/g, '')
  return o.code.toLowerCase().includes(t) || o.customer_name.toLowerCase().includes(t) || o.customer_email.toLowerCase().includes(t)
    || (digits.length >= 4 && o.customer_phone.includes(digits))
}
