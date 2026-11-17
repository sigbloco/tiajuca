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

export interface CreatedOrder { code: string; status: string }

const LOOKUP_KEY = 'shop:lookup'
/** Guarda código + telefone nesta aba para "Meus pedidos" abrir o pedido de visitante sozinho (também ao voltar do pagamento). */
export function rememberOrder(code: string, phone: string) {
  try { sessionStorage.setItem(LOOKUP_KEY, JSON.stringify({ code, phone })) } catch { /* sem armazenamento: o visitante informa código e telefone */ }
}

/** Uma chave por tentativa de compra: cliques repetidos e F5 devolvem o mesmo pedido em vez de criar outro. Troca depois do sucesso. */
export function attemptId(slug: string, renew = false): string {
  const k = `shop:attempt:${slug}`
  try {
    if (renew) { sessionStorage.removeItem(k); return '' }
    const cur = sessionStorage.getItem(k)
    if (cur) return cur
    const id = crypto.randomUUID()
    sessionStorage.setItem(k, id)
    return id
  } catch { return crypto.randomUUID() }
}
