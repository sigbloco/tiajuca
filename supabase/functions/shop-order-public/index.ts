// Edge Function: ações públicas sobre um pedido existente, SEM login. Quem conhece código + telefone do pedido pode agir nele.
// Limites contra adivinhação: por IP e por código (janela deslizante no banco). Respostas não distinguem "código errado" de "telefone errado".
//
// POST JSON: { action: 'report_payment', code, phone }  → cliente avisa que pagou (Pix): pedido vai para "pagamento em conferência".
//            { action: 'lookup', code, phone }          → pedido completo do próprio cliente (tela "Meus pedidos").
//            { action: 'status', code, phone }          → status atual do pedido (a confirmação atualiza sozinha após o pagamento).

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


/** Pede ao shop-mailer para esvaziar a fila agora (o agendamento do banco é só a rede de segurança). Não bloqueia a resposta. */
function flushMail() {
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/shop-mailer`, {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }, signal: AbortSignal.timeout(25_000),
  }).catch(() => {})
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(p)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }
  const code = String(body.code ?? '').trim().toUpperCase()
  const phone = String(body.phone ?? '')
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const ip = (req.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim()
  // `status` é consultado em intervalos pela tela de confirmação, então tem limites próprios e mais folgados.
  const polling = body.action === 'status'
  const limits = polling
    ? ([[`status-ip:${await sha256(ip)}`, 300], [`status-code:${code}`, 150]] as const)
    : ([[`order-ip:${await sha256(ip)}`, 30], [`order-code:${code}`, 20]] as const)
  for (const [bucket, max] of limits) {
    const { data: ok, error } = await admin.rpc('shop_rate_limit', { p_bucket: bucket, p_max: max, p_window: '1 hour' })
    if (error) { console.error('rate_limit', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!ok) return json({ error: 'Muitas tentativas. Aguarde um pouco e tente de novo.' }, 429)
  }

  if (body.action === 'report_payment') {
    const { data, error } = await admin.rpc('shop_report_payment', { p_code: code, p_phone: phone })
    if (error) { console.error('shop_report_payment', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
    flushMail()
    return json({ status: data.status })
  }
  if (body.action === 'lookup') {
    const { data, error } = await admin.rpc('shop_order_lookup', { p_code: code, p_phone: phone })
    if (error) { console.error('shop_order_lookup', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
    const { ok: _ok, ...order } = data
    return json(order)
  }
  if (body.action === 'status') {
    const { data, error } = await admin.rpc('shop_order_status', { p_code: code, p_phone: phone })
    if (error) { console.error('shop_order_status', error.message); return json({ error: 'Não foi possível processar agora.' }, 500) }
    if (!data?.ok) return json({ error: 'Pedido não encontrado. Confira o código e o telefone.' }, 404)
    return json({ status: data.status })
  }
  return json({ error: 'Ação inválida.' }, 400)
})
