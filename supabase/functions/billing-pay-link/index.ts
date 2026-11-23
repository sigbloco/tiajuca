// Edge Function: gera o link de pagamento (InfinitePay) de uma mensalidade. Exige login (verify_jwt) e a permissão de financeiro,
// conferida no banco por `charge_pay_info` com o token de quem chamou. O valor vem SEMPRE da cobrança, nunca do navegador.
//
// POST JSON: { charge_id } → { url }
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { LINKS_ENDPOINT, describeShape, extractCheckoutUrl } from './infinitepay.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }
  const chargeId = String(body.charge_id ?? '')
  if (!UUID.test(chargeId)) return json({ error: 'Cobrança inválida.' }, 400)

  // Cliente com o token de quem chamou: as regras de permissão do banco valem.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  })
  const { data: info, error } = await db.rpc('charge_pay_info', { p_charge: chargeId })
  if (error) return json({ error: error.code === 'P0001' || error.code === 'P0002' ? error.message : 'Sem permissão ou erro ao consultar a cobrança.' }, error.code === 'P0001' || error.code === 'P0002' ? 400 : 403)
  if (!info?.handle) return json({ error: 'Cadastre a InfiniteTag nas configurações da Loja.' }, 400)

  const month = String(info.competence).slice(0, 7).split('-').reverse().join('/')
  const site = info.public_site_url ? String(info.public_site_url).replace(/\/+$/, '') : null
  const payload: Record<string, unknown> = {
    handle: String(info.handle).replace(/^\$/, ''),
    order_nsu: info.code,
    webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/billing-infinitepay-webhook`,
    items: [{ quantity: 1, price: info.amount_cents, description: `Mensalidade ${month} - ${info.member_name}`.slice(0, 120) }],
  }
  if (site) payload.redirect_url = `${site}/${info.org_slug}`

  try {
    const res = await fetch(LINKS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`InfinitePay respondeu ${res.status}`)
    const data = await res.json().catch(() => null)
    const url = extractCheckoutUrl(data)
    if (!url) throw new Error(`resposta sem URL de pagamento (campos: ${describeShape(data)})`)
    const { error: setErr } = await db.rpc('charge_set_pay_link', { p_charge: chargeId, p_url: url })
    if (setErr) throw new Error(setErr.message)
    return json({ url })
  } catch (e) {
    console.error('billing-pay-link', (e as Error).message)
    return json({ error: 'Não foi possível gerar o link agora. Tente novamente.' }, 502)
  }
})
