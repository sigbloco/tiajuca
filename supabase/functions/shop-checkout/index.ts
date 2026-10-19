// Edge Function: cria o pedido da loja. Público (sem login), mas o navegador NUNCA decide preço, desconto ou estoque:
// tudo é conferido e gravado pela função SQL `shop_create_order` (transação única, trava de estoque, preço de integrante).
//
// POST JSON: { org_slug, name, phone, email, pickup_point_id, payment_method: 'pix' | 'infinitepay', items: [{ variant_id, quantity }] }
// Se a requisição vier com o token de um usuário logado, o preço de integrante só vale se ele for integrante ATIVO (checado no banco).
//
// Segredos/variáveis (opcionais): SHOP_RESERVATION_HOURS (padrão 48), SHOP_PAYMENT_METHODS (padrão "pix").

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cada método de pagamento é um provedor com a mesma forma. Pix não cria nada no servidor (pagamento conferido à mão).
// A InfinitePay entra aqui na etapa seguinte (cria o link de pagamento e devolve a URL).
type Order = Record<string, unknown>
interface Provider { start(order: Order): Promise<Record<string, unknown>> }
const providers: Record<string, Provider> = {
  pix: { start: async () => ({}) },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }

  const orgSlug = String(body.org_slug ?? '')
  const method = String(body.payment_method ?? '')
  const items = body.items
  const enabled = (Deno.env.get('SHOP_PAYMENT_METHODS') ?? 'pix').split(',').map((s) => s.trim()).filter(Boolean)
  if (!enabled.includes(method) || !providers[method]) return json({ error: 'Esse método de pagamento não está disponível.' }, 400)
  if (!Array.isArray(items) || items.length === 0 || items.length > 30
      || items.some((i) => !UUID.test(String(i?.variant_id)) || !Number.isInteger(i?.quantity))) {
    return json({ error: 'O carrinho está vazio ou inválido.' }, 400)
  }
  if (!UUID.test(String(body.pickup_point_id))) return json({ error: 'Escolha um ponto de retirada.' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Limite por IP (anti-abuso de reserva de estoque): 10 pedidos por hora.
  const ip = (req.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim()
  const { data: allowed, error: rlErr } = await admin.rpc('shop_rate_limit', { p_bucket: `checkout:${await sha256(ip)}`, p_max: 10, p_window: '1 hour' })
  if (rlErr) { console.error('rate_limit', rlErr.message); return json({ error: 'Não foi possível finalizar agora. Tente novamente.' }, 500) }
  if (!allowed) return json({ error: 'Muitas tentativas. Aguarde um pouco e tente de novo.' }, 429)

  const { data: orgId, error: orgErr } = await admin.rpc('shop_org_id', { p_slug: orgSlug })
  if (orgErr) { console.error('shop_org_id', orgErr.message); return json({ error: 'Não foi possível finalizar agora. Tente novamente.' }, 500) }
  if (!orgId) return json({ error: 'Loja não encontrada.' }, 404)

  // Usuário logado (opcional). Token de visitante (chave anon) não resolve usuário e segue como visitante.
  let userId: string | null = null
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token) {
    const { data } = await admin.auth.getUser(token)
    userId = data.user?.id ?? null
  }

  const hours = Math.min(24 * 14, Math.max(1, Number(Deno.env.get('SHOP_RESERVATION_HOURS') ?? 48) || 48))
  const { data: order, error } = await admin.rpc('shop_create_order', {
    p_org: orgId, p_user: userId, p_name: String(body.name ?? ''), p_phone: String(body.phone ?? ''), p_email: String(body.email ?? ''),
    p_pickup: body.pickup_point_id, p_method: method,
    p_items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })), p_hours: hours,
  })
  if (error) {
    // P0001 = regra de negócio com mensagem segura para o cliente; o resto é erro interno.
    if (error.code === 'P0001') return json({ error: error.message }, 400)
    console.error('shop_create_order', error.code, error.message)
    return json({ error: 'Não foi possível finalizar o pedido. Tente novamente.' }, 500)
  }

  const payment = await providers[method].start(order as Order)
  return json({ order, payment })
})
