// Edge Function: ações do PAINEL da loja que precisam de servidor. Exige usuário logado com a permissão `shop.manage`.
//
// POST JSON: { action: 'test_infinitepay', org_slug, handle }
//   Cria um link de R$ 1,00 na InfinitePay só para conferir se a InfiniteTag funciona e qual é o formato da resposta.
//   Ninguém é cobrado (o link só gera cobrança se alguém pagar) e nenhum pedido é criado nem webhook é registrado.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { LINKS_ENDPOINT, describeShape, extractCheckoutUrl } from './infinitepay.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const auth = req.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: 'Entre na sua conta para continuar.' }, 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Requisição inválida.' }, 400) }

  // Quem chama precisa ser um usuário logado COM permissão na loja (checada no banco, com o token da própria pessoa).
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: orgId } = await admin.rpc('shop_org_id', { p_slug: String(body.org_slug ?? '') })
  if (!orgId) return json({ error: 'Loja não encontrada.' }, 404)
  const { data: allowed } = await asUser.rpc('has_permission', { p_org: orgId, p_perm: 'shop.manage' })
  if (allowed !== true) return json({ error: 'Você não tem permissão para gerenciar a loja.' }, 403)

  if (body.action === 'test_infinitepay') {
    const handle = String(body.handle ?? '').trim().replace(/^\$/, '')
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(handle)) return json({ ok: false, message: 'InfiniteTag inválida. Use só letras, números, ponto, hífen ou sublinhado (sem o $).' })
    try {
      const res = await fetch(LINKS_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          handle, order_nsu: `TESTE${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          items: [{ quantity: 1, price: 100, description: 'Teste de conexão (não pagar)' }],
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) return json({ ok: false, message: `A InfinitePay recusou o teste (código ${res.status}). Confira se a InfiniteTag está correta.`, shape: describeShape(data) })
      const url = extractCheckoutUrl(data)
      if (!url) return json({ ok: false, message: 'A InfinitePay respondeu, mas não encontrei o endereço de pagamento na resposta. Avise o suporte técnico.', shape: describeShape(data) })
      return json({ ok: true, message: 'Conexão funcionando! Foi criado um link de teste de R$ 1,00 (ninguém foi cobrado).', url })
    } catch (e) {
      console.error('test_infinitepay', (e as Error).message)
      return json({ ok: false, message: 'Não foi possível falar com a InfinitePay agora. Tente novamente.' })
    }
  }
  return json({ error: 'Ação inválida.' }, 400)
})
