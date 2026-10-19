// Edge Function: cria o pedido da loja. Público (sem login), mas o navegador NUNCA decide preço, desconto ou estoque:
// tudo é conferido e gravado pela função SQL `shop_create_order` (transação única, trava de estoque, preço de integrante).
//
// POST JSON: { org_slug, name, phone, email, pickup_point_id, payment_method: 'pix' | 'infinitepay', items: [{ variant_id, quantity }] }
// Se a requisição vier com o token de um usuário logado, o preço de integrante só vale se ele for integrante ATIVO (checado no banco).
//
// Métodos de pagamento, InfiniteTag e endereço público do site vêm da tabela `shop_settings` (editável no painel da loja).
// Variável opcional: SHOP_RESERVATION_HOURS (padrão 48).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { LINKS_ENDPOINT, buildLinkPayload, describeShape, extractCheckoutUrl, sumItems, type LinkItemInput } from './infinitepay.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')


/** Pede ao shop-mailer para esvaziar a fila agora (o agendamento do banco é só a rede de segurança). Não bloqueia a resposta. */
function flushMail() {
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/shop-mailer`, {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }, signal: AbortSignal.timeout(25_000),
  }).catch(() => {})
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(p)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Settings { payment_methods: string[]; infinitepay_handle: string | null; public_site_url: string | null; pix_key: string | null; pix_beneficiary: string | null }

// Cada método de pagamento é um provedor com a mesma forma. Pix não cria nada no servidor (pagamento conferido à mão).
// InfinitePay cria um link de pagamento (crédito ou Pix na página deles); a confirmação chega pelo webhook (shop-infinitepay-webhook).
type Order = Record<string, unknown>
type Admin = ReturnType<typeof createClient>
interface Ctx { orgSlug: string; settings: Settings; customer: { name: string; email: string; phone: string } }
interface Provider { available(s: Settings): boolean; start(order: Order, ctx: Ctx, admin: Admin): Promise<Record<string, unknown>> }

const providers: Record<string, Provider> = {
  pix: { available: (s) => s.payment_methods.includes('pix') && !!s.pix_key && !!s.pix_beneficiary, start: async () => ({}) },
  infinitepay: {
    available: (s) => s.payment_methods.includes('infinitepay') && !!s.infinitepay_handle && !!s.public_site_url,
    async start(order, ctx, admin) {
      const site = ctx.settings.public_site_url!.replace(/\/+$/, '')
      const digits = ctx.customer.phone.replace(/\D/g, '')
      const payload = buildLinkPayload({
        handle: ctx.settings.infinitepay_handle!, orderCode: String(order.code), items: order.items as LinkItemInput[],
        redirectUrl: `${site}/${ctx.orgSlug}/loja/pedido/${order.code}`,
        webhookUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/shop-infinitepay-webhook`,
        customer: { name: ctx.customer.name, email: ctx.customer.email, phone: digits.length <= 11 ? `55${digits}` : digits },
      })
      if (sumItems(payload) !== order.total_cents) throw new Error('soma dos itens diferente do total do pedido')
      const res = await fetch(LINKS_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`InfinitePay respondeu ${res.status}`)
      const data = await res.json().catch(() => null)
      const url = extractCheckoutUrl(data)
      if (!url) throw new Error(`resposta sem URL de pagamento (campos: ${describeShape(data)})`)
      await admin.rpc('shop_set_payment_ref', { p_code: order.code, p_ref: { provider: 'infinitepay', link_url: url } })
      return { url }
    },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }

  const orgSlug = String(body.org_slug ?? '')
  const method = String(body.payment_method ?? '')
  const items = body.items
  if (!providers[method]) return json({ error: 'Esse método de pagamento não está disponível.' }, 400)
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

  const { data: settings, error: setErr } = await admin.rpc('shop_get_settings', { p_org: orgId })
  if (setErr || !settings) { console.error('shop_get_settings', setErr?.message); return json({ error: 'Não foi possível finalizar agora. Tente novamente.' }, 500) }
  const provider = providers[method]
  if (!provider.available(settings as Settings)) return json({ error: 'Esse método de pagamento não está disponível.' }, 400)

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

  try {
    const payment = await provider.start(order as Order, {
      orgSlug, settings: settings as Settings,
      customer: { name: String(body.name ?? '').trim(), email: String(body.email ?? '').trim(), phone: String(body.phone ?? '') },
    }, admin)
    flushMail()
    return json({ order, payment })
  } catch (e) {
    // O pedido já reservou estoque: se o pagamento não pôde ser iniciado, cancela e libera a reserva.
    console.error('provider.start', method, (e as Error).message)
    const code = (order as Order).code
    const { data: info } = await admin.rpc('shop_order_for_payment', { p_code: code })
    if (info?.id) await admin.rpc('shop_cancel_order', { p_order: info.id, p_reason: 'Falha ao iniciar o pagamento', p_actor_member: null, p_actor_label: 'sistema' })
    return json({ error: 'Não foi possível iniciar o pagamento agora. Tente novamente ou escolha outra forma de pagamento.' }, 502)
  }
})
