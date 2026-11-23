// Edge Function: ações públicas sobre um pedido existente, SEM login. Quem conhece código + telefone do pedido pode agir nele.
// Limites contra adivinhação: por IP e por código (janela deslizante no banco). Respostas não distinguem "código errado" de "telefone errado".
//
// POST JSON: { action: 'lookup', code, phone }   → pedido completo do próprio cliente (tela "Meus pedidos").
//            { action: 'status', code, phone }   → status atual do pedido (a tela acompanha o pagamento com esta ação, a cada 30 s).
//            { action: 'cancel', code, phone }   → cliente cancela pedido ainda aguardando pagamento.
//            { action: 'mine', org_slug }        → logado: os próprios pedidos, sem código/telefone.
// O antigo "avisei que paguei" (report_payment) foi desligado: o cliente manda o comprovante e a loja marca como pago.

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

/** IP de quem chamou: o cabeçalho do Cloudflare (o cliente não consegue forjar); o x-forwarded-for só se ele faltar. */
const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'desconhecido').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }
  const code = String(body.code ?? '').trim().toUpperCase()
  const phone = String(body.phone ?? '')

  // Usuário logado: vê os próprios pedidos sem código/telefone. Token de visitante (chave anon) não resolve usuário.
  if (body.action === 'mine' || (!phone && (body.action === 'lookup' || body.action === 'cancel'))) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } }
    const user = u.user
    if (!user) return json({ error: 'Entre na sua conta ou informe o código e o telefone do pedido.' }, 401)
    const { data: orgId } = await admin.rpc('shop_org_id', { p_slug: String(body.org_slug ?? '') })
    if (!orgId) return json({ error: 'Loja não encontrada.' }, 404)
    // Pedido feito sem login só é casado pelo e-mail se a conta tiver o e-mail confirmado (LOJA-20).
    const email = user.email && user.email_confirmed_at ? user.email : null
    if (body.action === 'mine') {
      const { data, error } = await admin.rpc('shop_orders_of_user', { p_org: orgId, p_user: user.id, p_email: email })
      if (error) { console.error('shop_orders_of_user', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
      return json({ orders: data })
    }
    if (body.action === 'cancel') {
      const { data, error } = await admin.rpc('shop_cancel_by_customer', { p_org: orgId, p_user: user.id, p_email: email, p_code: code, p_phone: '' })
      if (error) { console.error('shop_cancel_by_customer', error.message); return json({ error: 'Não foi possível cancelar agora.' }, 500) }
      if (data?.reason === 'locked') return json({ error: 'Este pedido já não está aguardando pagamento, então não pode ser cancelado aqui.' }, 409)
      if (!data?.ok) return json({ error: 'Pedido não encontrado.' }, 404)
      return json({ status: data.status })
    }
    const { data: list } = await admin.rpc('shop_orders_of_user', { p_org: orgId, p_user: user.id, p_email: email })
    const found = ((list ?? []) as { order: { code: string } }[]).find((o) => o.order.code === code)
    return found ? json(found) : json({ error: 'Pedido não encontrado.' }, 404)
  }

  if (!['lookup', 'status', 'cancel'].includes(String(body.action))) return json({ error: 'Ação inválida.' }, 400)
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const ip = await sha256(clientIp(req))
  // `status` é consultado em intervalos pela tela de confirmação, então tem limites próprios e mais folgados.
  const polling = body.action === 'status'
  const limits = polling
    ? ([[`status-ip:${ip}`, 300], [`status-code:${code}`, 150]] as const)
    : ([[`order-ip:${ip}`, 30], [`order-code:${code}`, 20]] as const)
  for (const [bucket, max] of limits) {
    const { data: ok, error } = await admin.rpc('shop_rate_limit', { p_bucket: bucket, p_max: max, p_window: '1 hour' })
    if (error) { console.error('rate_limit', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!ok) return json({ error: 'Muitas tentativas. Aguarde um pouco e tente de novo.' }, 429)
  }

  if (body.action === 'cancel') {
    const { data, error } = await admin.rpc('shop_cancel_by_customer', { p_org: null, p_user: null, p_email: null, p_code: code, p_phone: phone })
    if (error) { console.error('shop_cancel_by_customer', error.message); return json({ error: 'Não foi possível cancelar agora.' }, 500) }
    if (data?.reason === 'locked') return json({ error: 'Este pedido já não está aguardando pagamento, então não pode ser cancelado aqui.' }, 409)
    if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
    return json({ status: data.status })
  }
  if (body.action === 'lookup') {
    const { data, error } = await admin.rpc('shop_order_lookup', { p_code: code, p_phone: phone })
    if (error) { console.error('shop_order_lookup', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
    const { ok: _ok, ...order } = data
    return json(order)
  }
  const { data, error } = await admin.rpc('shop_order_status', { p_code: code, p_phone: phone })
  if (error) { console.error('shop_order_status', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
  if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
  return json({ status: data.status })
})
