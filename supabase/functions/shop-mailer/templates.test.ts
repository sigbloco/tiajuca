import { describe, expect, it } from 'vitest'
import { brl, buildEmail, escapeHtml, type MailContext, type TemplateKey } from './templates'

const ctx = (over: Partial<MailContext> = {}, order: Partial<MailContext['order']> = {}): MailContext => ({
  outbox_id: 'o1', template: 'order_created', to_email: 'maria@ex.com', kind: null, cancel_reason: null,
  order: {
    code: 'HN5XCGA4', customer_name: 'Maria', status: 'awaiting_payment', payment_method: 'pix', subtotal_cents: 15500, discount_cents: 1200, total_cents: 14300,
    expires_at: '2026-10-21T16:00:00Z', payment_url: null,
    items: [{ name: 'Camisa', variant: 'M', quantity: 2, unit_final_cents: 5400, kind: 'stock' }, { name: 'Boné', variant: 'Único', quantity: 1, unit_final_cents: 3500, kind: 'made_to_order' }],
    ...order,
  },
  pickup: { name: 'Quadra', address: 'Rua A, 10', opening_hours: 'Seg a sex, 10h às 18h' },
  org: { name: 'Cordão da Tia Juca' },
  settings: {
    pix_key: 'pix@tiajuca.com.br', pix_beneficiary: 'Rafael', public_site_url: 'https://loja.exemplo.com/', contact_whatsapp: '5521990698483', contact_email: 'contato@ex.com',
    directors: [{ name: 'Maira', whatsapp: '5521984843223' }], mail_from_name: 'Tia Juca', mail_from_email: 'contato@ex.com',
  },
  ...over,
})

describe('formatação', () => {
  it('formata reais com milhar e vírgula', () => {
    expect(brl(14300)).toBe('R$ 143,00')
    expect(brl(123456789)).toBe('R$ 1.234.567,89')
    expect(brl(5)).toBe('R$ 0,05')
  })
  it('escapa HTML', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;')
  })
})

describe('pedido criado', () => {
  const m = buildEmail(ctx())
  it('assunto com o código; corpo com itens, total, desconto e retirada', () => {
    expect(m.subject).toBe('Pedido HN5XCGA4 recebido — falta o pagamento')
    for (const part of ['Camisa (M)', 'sob encomenda', 'R$ 143,00', 'Desconto de integrante', 'Quadra', 'Rua A, 10']) {
      expect(m.html).toContain(part); expect(m.text).toContain(part)
    }
  })
  it('Pix: chave, valor exato, referência e prazo de reserva', () => {
    for (const part of ['pix@tiajuca.com.br', 'Rafael', 'Referência', 'HN5XCGA4', 'reservados até']) expect(m.text).toContain(part)
    expect(m.text).toContain('Valor exato: R$ 143,00')
  })
  it('rodapé com contatos, Direção e link da loja sem barra final', () => {
    expect(m.text).toContain('https://wa.me/5521990698483')
    expect(m.text).toContain('Maira: https://wa.me/5521984843223')
    expect(m.text).toContain('Loja: https://loja.exemplo.com')
    expect(m.text).not.toContain('exemplo.com/\n')
  })
  it('InfinitePay: link de pagamento no lugar da chave Pix', () => {
    const ip = buildEmail(ctx({}, { payment_method: 'infinitepay', payment_url: 'https://checkout.infinitepay.io/abc' }))
    expect(ip.html).toContain('href="https://checkout.infinitepay.io/abc"')
    expect(ip.text).toContain('https://checkout.infinitepay.io/abc')
    expect(ip.text).not.toContain('pix@tiajuca.com.br')
  })
  it('sem endereço do site e sem contatos não quebra nem inventa links', () => {
    const bare = buildEmail(ctx({ settings: null }))
    expect(bare.text).not.toContain('Loja:')
    expect(bare.text).not.toContain('wa.me')
  })
})

describe('segurança do conteúdo', () => {
  it('escapa nome do cliente, item e motivo de cancelamento', () => {
    const evil = '<script>alert(1)</script>'
    const a = buildEmail(ctx({}, { customer_name: evil, items: [{ name: evil, variant: '"M"', quantity: 1, unit_final_cents: 100, kind: 'stock' }] }))
    expect(a.html).not.toContain('<script>')
    expect(a.html).toContain('&lt;script&gt;')
    const b = buildEmail(ctx({ template: 'cancelled', cancel_reason: evil }))
    expect(b.html).not.toContain('<script>')
  })
})

describe('demais avisos por mudança de status', () => {
  const subj = (t: TemplateKey, kind: MailContext['kind'] = null, extra: Partial<MailContext> = {}) => buildEmail(ctx({ template: t, kind, ...extra })).subject
  it('assuntos', () => {
    expect(subj('payment_review')).toBe('Pedido HN5XCGA4: pagamento em conferência')
    expect(subj('paid')).toBe('Pedido HN5XCGA4: pagamento confirmado')
    expect(subj('cancelled')).toBe('Pedido HN5XCGA4 cancelado')
    expect(subj('fulfillment_in_preparation', 'made_to_order')).toBe('Pedido HN5XCGA4: seus itens sob encomenda estão em preparo')
    expect(subj('fulfillment_ready', 'stock')).toBe('Pedido HN5XCGA4: itens pronta entrega prontos para retirada')
    expect(subj('fulfillment_picked_up', 'stock')).toBe('Pedido HN5XCGA4: retirada dos itens pronta entrega registrada')
  })
  it('pago explica os próximos passos; pronto traz o ponto de retirada; cancelado traz o motivo', () => {
    expect(buildEmail(ctx({ template: 'paid' })).text).toContain('Avisaremos quando os itens estiverem prontos')
    const ready = buildEmail(ctx({ template: 'fulfillment_ready', kind: 'made_to_order' }))
    expect(ready.text).toContain('Quadra')
    expect(ready.text).toContain('sob encomenda')
    expect(buildEmail(ctx({ template: 'cancelled', cancel_reason: 'Prazo para pagamento expirado' })).text).toContain('Motivo: Prazo para pagamento expirado.')
    expect(buildEmail(ctx({ template: 'cancelled' })).text).not.toContain('Motivo:')
  })
  it('todo e-mail traz o código para consulta e o nome do bloco', () => {
    const keys: TemplateKey[] = ['order_created', 'payment_review', 'paid', 'cancelled', 'fulfillment_in_preparation', 'fulfillment_ready', 'fulfillment_picked_up']
    for (const t of keys) {
      const m = buildEmail(ctx({ template: t, kind: 'stock' }))
      expect(m.text).toContain('HN5XCGA4')
      expect(m.text).toContain('Cordão da Tia Juca')
      expect(m.html.startsWith('<!doctype html>')).toBe(true)
    }
  })
})
