// Edge Function: aviso da InfinitePay de "pagamento aprovado" para MENSALIDADES. Pública: verify_jwt = false.
//
// SEGURANÇA: o aviso não é assinado; o corpo é só uma dica. O pagamento só é baixado depois de a própria InfinitePay confirmar
// (`payment_check`) e de o valor bater com a cobrança. Respostas: 200 = tratado/nada a fazer; 400 = falha temporária (ela tenta de novo).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PAYMENT_CHECK_ENDPOINT, isPaymentConfirmed, parseWebhook } from './verify.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  let raw: unknown
  try { raw = await req.json() } catch { return json({ ignored: 'corpo inválido' }) }
  const hook = parseWebhook(raw)
  if (!hook) return json({ ignored: 'corpo inesperado' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: charge, error: chErr } = await admin.rpc('charge_for_payment', { p_code: hook.order_nsu })
  if (chErr) { console.error('charge_for_payment', chErr.message); return json({ error: 'temporário' }, 400) }
  if (!charge) return json({ ignored: 'cobrança desconhecida' })
  if (charge.status === 'paid') return json({ ok: true, already: true })
  if (!charge.handle) return json({ error: 'InfinitePay não configurada.' }, 503)

  let check: unknown
  try {
    const res = await fetch(PAYMENT_CHECK_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ handle: String(charge.handle).replace(/^\$/, ''), order_nsu: hook.order_nsu, transaction_nsu: hook.transaction_nsu, slug: hook.invoice_slug }),
    })
    if (!res.ok) { console.error('payment_check status', res.status); return json({ error: 'temporário' }, 400) }
    check = await res.json()
  } catch (e) {
    console.error('payment_check', (e as Error).message)
    return json({ error: 'temporário' }, 400)
  }
  if (!isPaymentConfirmed(check, charge.amount_cents)) { console.warn('pagamento não confirmado', hook.order_nsu); return json({ ignored: 'não confirmado' }) }

  const c = check as { paid_amount?: number; installments?: number; capture_method?: string }
  const { data: result, error } = await admin.rpc('charge_mark_paid_by_link', {
    p_code: hook.order_nsu,
    p_ref: { transaction_nsu: hook.transaction_nsu, invoice_slug: hook.invoice_slug, receipt_url: hook.receipt_url, paid_amount: c.paid_amount ?? null, capture_method: c.capture_method ?? hook.capture_method },
  })
  if (error) { console.error('charge_mark_paid_by_link', error.message); return json({ error: 'temporário' }, 400) }
  return json({ ok: true, result })
})
