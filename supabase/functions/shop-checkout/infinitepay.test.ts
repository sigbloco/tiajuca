import { describe, expect, it } from 'vitest'
import { buildLinkPayload, describeShape, extractCheckoutUrl, sumItems, toE164 } from './infinitepay'

const args = {
  handle: '$tiajuca', orderCode: 'HN5XCGA4',
  items: [{ name: 'Camisa 2027', variant: 'M', quantity: 2, unit_final_cents: 5400 }, { name: 'Boné', variant: 'Único', quantity: 1, unit_final_cents: 3500 }],
  redirectUrl: 'https://loja.exemplo.com/tiajuca/loja/pedido/HN5XCGA4', webhookUrl: 'https://x.supabase.co/functions/v1/shop-infinitepay-webhook',
  customer: { name: 'Maria', email: 'm@ex.com', phone: '5521999998888' },
}

describe('payload do link (campos conforme a documentação)', () => {
  const p = buildLinkPayload(args)
  it('usa o handle sem $, o código do pedido como order_nsu e preços em centavos', () => {
    expect(p.handle).toBe('tiajuca')
    expect(p.order_nsu).toBe('HN5XCGA4')
    expect(p.items).toEqual([
      { quantity: 2, price: 5400, description: 'Camisa 2027 (M)' },
      { quantity: 1, price: 3500, description: 'Boné (Único)' },
    ])
  })
  it('a soma dos itens é exatamente o total do pedido (desconto já embutido no preço)', () => {
    expect(sumItems(p)).toBe(14300)
  })
  it('telefone vai em formato internacional e redirect/webhook são repassados', () => {
    expect(p.customer.phone_number).toBe('+5521999998888')
    expect(toE164('(55) 21 99999-8888')).toBe('+5521999998888')
    expect(p.redirect_url).toBe(args.redirectUrl)
    expect(p.webhook_url).toBe(args.webhookUrl)
  })
  it('corta descrições muito longas', () => {
    const long = buildLinkPayload({ ...args, items: [{ name: 'x'.repeat(300), variant: 'M', quantity: 1, unit_final_cents: 100 }] })
    expect(long.items[0].description.length).toBeLessThanOrEqual(120)
  })
})

describe('leitura da URL de pagamento (resposta não documentada)', () => {
  it('encontra a URL em campos comuns, inclusive aninhados', () => {
    expect(extractCheckoutUrl({ url: 'https://checkout.infinitepay.io/tiajuca?lenc=abc' })).toBe('https://checkout.infinitepay.io/tiajuca?lenc=abc')
    expect(extractCheckoutUrl({ data: { checkout_url: 'https://pay.infinitepay.io/x' } })).toBe('https://pay.infinitepay.io/x')
    expect(extractCheckoutUrl({ slug: 'abc', outro: 'https://infinitepay.io/p/abc' })).toBe('https://infinitepay.io/p/abc')
  })
  it('recusa outros domínios, http e respostas sem URL (evita redirecionar o cliente para fora)', () => {
    expect(extractCheckoutUrl({ url: 'https://malicioso.com/infinitepay.io' })).toBeNull()
    expect(extractCheckoutUrl({ url: 'https://infinitepay.io.evil.com/x' })).toBeNull()
    expect(extractCheckoutUrl({ url: 'http://checkout.infinitepay.io/x' })).toBeNull()
    expect(extractCheckoutUrl({ slug: 'abc' })).toBeNull()
    expect(extractCheckoutUrl(null)).toBeNull()
    expect(extractCheckoutUrl('texto')).toBeNull()
  })
  it('descreve só os nomes dos campos para log', () => {
    expect(describeShape({ slug: 'segredo', foo: 1 })).toBe('slug,foo')
    expect(describeShape(null)).toBe('object')
  })
})
