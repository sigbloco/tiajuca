// CÓPIA de ../shop-checkout/infinitepay.ts (cada Edge Function é publicada isolada). Ao mudar um, mude o outro.
// InfinitePay · criar link de checkout. Funções PURAS (sem rede), testadas em infinitepay.test.ts.
// Documentação oficial: https://www.infinitepay.io/checkout-documentacao
//   POST https://api.checkout.infinitepay.io/links  { handle, items: [{ quantity, price (centavos), description }],
//        order_nsu, redirect_url, webhook_url, customer: { name, email, phone_number } }
// A documentação NÃO descreve o corpo da resposta; por isso a URL de pagamento é procurada com tolerância e só aceita https em infinitepay.io.

export const LINKS_ENDPOINT = 'https://api.checkout.infinitepay.io/links'

export interface LinkItemInput { name: string; variant: string; quantity: number; unit_final_cents: number }

export interface LinkPayload {
  handle: string
  order_nsu: string
  redirect_url: string
  webhook_url: string
  items: { quantity: number; price: number; description: string }[]
  customer: { name: string; email: string; phone_number: string }
}

/** '5521999998888' → '+5521999998888' (formato pedido pela documentação). */
export const toE164 = (digits: string): string => `+${digits.replace(/\D/g, '')}`

export function buildLinkPayload(a: {
  handle: string; orderCode: string; items: LinkItemInput[]; redirectUrl: string; webhookUrl: string
  customer: { name: string; email: string; phone: string }
}): LinkPayload {
  return {
    handle: a.handle.replace(/^\$/, ''),
    order_nsu: a.orderCode,
    redirect_url: a.redirectUrl,
    webhook_url: a.webhookUrl,
    // O desconto de integrante já está no preço unitário final: a soma dos itens é exatamente o total do pedido.
    items: a.items.map((i) => ({ quantity: i.quantity, price: i.unit_final_cents, description: `${i.name} (${i.variant})`.slice(0, 120) })),
    customer: { name: a.customer.name, email: a.customer.email, phone_number: toE164(a.customer.phone) },
  }
}

export const sumItems = (p: Pick<LinkPayload, 'items'>): number => p.items.reduce((s, i) => s + i.price * i.quantity, 0)

const HOST_OK = (host: string) => host === 'infinitepay.io' || host.endsWith('.infinitepay.io')
const PREFERRED_KEYS = ['url', 'checkout_url', 'payment_url', 'link', 'checkout_link', 'invoice_url']

/** Procura a URL de pagamento na resposta (formato não documentado). Só aceita https em *.infinitepay.io. */
export function extractCheckoutUrl(resp: unknown): string | null {
  const ok = (v: unknown): v is string => {
    if (typeof v !== 'string') return false
    try { const u = new URL(v); return u.protocol === 'https:' && HOST_OK(u.hostname) } catch { return false }
  }
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 3 || node === null || typeof node !== 'object') return null
    const obj = node as Record<string, unknown>
    for (const k of PREFERRED_KEYS) if (ok(obj[k])) return obj[k] as string
    for (const v of Object.values(obj)) { if (ok(v)) return v; }
    for (const v of Object.values(obj)) { const r = walk(v, depth + 1); if (r) return r }
    return null
  }
  return walk(resp, 0)
}

/** Nomes (sem valores) dos campos da resposta, para registrar em log quando a URL não é encontrada. */
export const describeShape = (resp: unknown): string =>
  resp && typeof resp === 'object' ? Object.keys(resp as object).slice(0, 20).join(',') : typeof resp
