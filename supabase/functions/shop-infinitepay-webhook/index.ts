// Edge Function: webhook da InfinitePay ("pagamento aprovado"). Pública (a InfinitePay não envia JWT do Supabase): verify_jwt = false.
//
// SEGURANÇA: a documentação não prevê assinatura do webhook. Portanto o corpo recebido é tratado como uma DICA, nunca como prova.
// O pagamento só é registrado depois de perguntar à própria InfinitePay (`payment_check`) e de o valor bater com o total do pedido.
// Respostas: 200 = tratado (ou nada a fazer); 400 = falha temporária ou ainda não pago, a InfinitePay tenta de novo.
// Cada transaction_nsu só dá baixa uma vez (tabela infinitepay_transactions, compartilhada com as mensalidades).
//
// A InfiniteTag vem das configurações da loja (tabela shop_settings). Sem ela a função responde 503.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { PAYMENT_CHECK_ENDPOINT, parseWebhook, paymentVerdict } from './verify.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })


/** Pede ao shop-mailer para esvaziar a fila agora (o agendamento do banco é só a rede de segurança). Não bloqueia a resposta. */
function flushMail() {
  const p = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/shop-mailer`, {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` }, signal: AbortSignal.timeout(25_000),
  }).catch(() => {})
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(p)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  let raw: unknown
  try { raw = await req.json() } catch { return json({ ignored: 'corpo inválido' }) }
  const hook = parseWebhook(raw)
  if (!hook) return json({ ignored: 'corpo inesperado' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: order, error: orderErr } = await admin.rpc('shop_order_for_payment', { p_code: hook.order_nsu })
  if (orderErr) { console.error('shop_order_for_payment', orderErr.message); return json({ error: 'temporário' }, 400) }
  if (!order || order.payment_method !== 'infinitepay') return json({ ignored: 'pedido desconhecido' })
  if (order.status === 'paid') return json({ ok: true, already: true })
  const handle = order.infinitepay_handle as string | null
  if (!handle) return json({ error: 'InfinitePay não configurada.' }, 503)

  // Pergunta à InfinitePay se o pagamento é real.
  let check: unknown
  try {
    const res = await fetch(PAYMENT_CHECK_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ handle: handle.replace(/^\$/, ''), order_nsu: hook.order_nsu, transaction_nsu: hook.transaction_nsu, slug: hook.invoice_slug }),
    })
    if (!res.ok) { console.error('payment_check status', res.status); return json({ error: 'temporário' }, 400) }
    check = await res.json()
  } catch (e) {
    console.error('payment_check', (e as Error).message)
    return json({ error: 'temporário' }, 400)
  }

  const verdict = paymentVerdict(check, order.total_cents)
  if (verdict === 'not_paid') {
    // Pode ser cedo demais: 400 faz a InfinitePay reenviar o aviso (LOJA-05).
    console.warn('pagamento ainda não confirmado pela InfinitePay', hook.order_nsu)
    return json({ error: 'ainda não confirmado' }, 400)
  }
  if (verdict === 'mismatch') {
    console.warn('valor confirmado pela InfinitePay não bate com o pedido', hook.order_nsu)
    return json({ ignored: 'valor diferente' })
  }

  // Uma transação dá baixa em um só pedido/cobrança (SUS-01).
  const { data: claimed, error: claimErr } = await admin.rpc('infinitepay_claim_transaction', { p_tx: hook.transaction_nsu, p_kind: 'shop', p_code: hook.order_nsu })
  if (claimErr) { console.error('infinitepay_claim_transaction', claimErr.message); return json({ error: 'temporário' }, 400) }
  if (claimed !== true) {
    console.warn('transação já usada em outro pedido/cobrança', hook.order_nsu, hook.transaction_nsu)
    return json({ ignored: 'transação já usada' })
  }

  const c = check as { paid_amount?: number; installments?: number; capture_method?: string }
  const { data: result, error } = await admin.rpc('shop_mark_paid', {
    p_code: hook.order_nsu, p_via: 'webhook', p_actor_member: null, p_actor_label: 'InfinitePay',
    p_ref: {
      transaction_nsu: hook.transaction_nsu, invoice_slug: hook.invoice_slug, receipt_url: hook.receipt_url,
      paid_amount: c.paid_amount ?? null, installments: c.installments ?? null, capture_method: c.capture_method ?? hook.capture_method,
    },
  })
  if (error) { console.error('shop_mark_paid', error.message); return json({ error: 'temporário' }, 400) }
  flushMail()
  return json({ ok: true, result })
})
