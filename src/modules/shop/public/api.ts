import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/core/supabase'

/** Chama uma Edge Function da loja e devolve a mensagem de erro em português que o servidor enviou. */
export async function invokeShop<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: string } | null
      throw new Error(payload?.error ?? 'Não foi possível concluir agora. Tente novamente.')
    }
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.')
  }
  return data as T
}

export interface CreatedOrder {
  code: string; status: string; payment_method: 'pix' | 'infinitepay'
  subtotal_cents: number; discount_cents: number; total_cents: number; expires_at: string | null; is_member_price: boolean
  pickup: { name: string; address: string; opening_hours: string }
  items: { name: string; variant: string; quantity: number; unit_final_cents: number; kind: 'stock' | 'made_to_order' }[]
  kinds: string[]
}

/** Dados do pedido recém-criado, guardados só nesta aba para a tela de confirmação sobreviver a um F5. */
export interface OrderSnapshot { order: CreatedOrder; customerName: string; phone: string }
const key = (code: string) => `shop:order:${code}`

export function saveSnapshot(s: OrderSnapshot) {
  try { sessionStorage.setItem(key(s.order.code), JSON.stringify(s)) } catch { /* sem armazenamento: a confirmação some ao recarregar */ }
}
export function loadSnapshot(code: string): OrderSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key(code))
    return raw ? (JSON.parse(raw) as OrderSnapshot) : null
  } catch { return null }
}
