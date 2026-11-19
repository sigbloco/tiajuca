import { describe, expect, it } from 'vitest'
import { pixCopyPaste as sitePix } from '../../../src/modules/shop/payments/pix'
import { brl, buildEmail, buildFormEmail, escapeHtml, pixCodeFor, PIX_QR_CID, type MailContext, type TemplateKey } from './templates'

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
  it('Pix: copia e cola igual ao do site, QR embutido e como mandar o comprovante', () => {
    const code = pixCodeFor(ctx())!
    expect(code).toBe(sitePix({ key: 'pix@tiajuca.com.br', beneficiary: 'Rafael', amountCents: 14300, txid: 'HN5XCGA4' }))
    expect(m.text).toContain(code)
    expect(m.html).toContain(code)
    expect(m.html).not.toContain('cid:pixqr')
    const withQr = buildEmail(ctx(), { qrCid: PIX_QR_CID })
    expect(withQr.html).toContain('<img src="cid:pixqr"')
    expect(withQr.text).not.toContain('cid:')
    for (const part of ['Responda este e-mail com o comprovante', 'https://wa.me/5521990698483?text=', encodeURIComponent('pedido HN5XCGA4 (R$ 143,00), em nome de Maria')]) expect(m.text).toContain(part)
  })
  it('comprovante: com o favorecido na Direção, o WhatsApp é o dele', () => {
    const e = buildEmail(ctx({ settings: { ...ctx().settings!, pix_beneficiary: 'Maira Souza' } }))
    expect(e.text).toContain('https://wa.me/5521984843223?text=')
  })
  it('InfinitePay não leva QR nem copia e cola', () => {
    const ip = buildEmail(ctx({}, { payment_method: 'infinitepay', payment_url: 'https://checkout.infinitepay.io/abc' }), { qrCid: PIX_QR_CID })
    expect(ip.html).not.toContain('cid:')
    expect(ip.text).not.toContain('copia e cola')
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
  it('pagamento confirmado avisa quanto falta para a produção começar (um aviso por produto)', () => {
    const bone = { name: 'Boné', variant: 'Único', quantity: 1, unit_final_cents: 3500, kind: 'made_to_order' as const, product_id: 'p2', progress: { min_units: 50, confirmed_units: 38 } }
    const m = buildEmail(ctx({ template: 'paid' }, { items: [bone, { ...bone, variant: 'G' }] }))
    expect(m.text).toContain('Faltam 12 unidades pagas para a produção de Boné começar (38 de 50). Avisaremos quando começar.')
    expect(m.text.match(/Faltam 12/g)).toHaveLength(1)
    const done = buildEmail(ctx({ template: 'paid' }, { items: [{ ...bone, progress: { min_units: 50, confirmed_units: 50 } }] }))
    expect(done.text).toContain('A produção de Boné já começou')
    expect(buildEmail(ctx({ template: 'paid' })).text).not.toContain('Faltam')
    expect(buildEmail(ctx({ template: 'order_created' }, { items: [bone] })).text).not.toContain('Faltam')
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

describe('produção começou (mínimo atingido)', () => {
  const m = buildEmail(ctx({ template: 'production_started', product: { name: 'Camiseta oficial', min_units: 50, lead_time_days: '10-15 dias úteis' } }))
  it('assunto com o produto; corpo com o mínimo, o prazo e o pedido', () => {
    expect(m.subject).toBe('Camiseta oficial: chegamos ao mínimo, a produção começou!')
    for (const part of ['50 unidades pagas', '10-15 dias úteis', 'HN5XCGA4', 'Quadra']) { expect(m.html).toContain(part); expect(m.text).toContain(part) }
  })
  it('sem prazo cadastrado, não inventa um', () => {
    const n = buildEmail(ctx({ template: 'production_started', product: { name: 'Boné', min_units: 20, lead_time_days: null } }))
    expect(n.text).toContain('Avisaremos quando estiver pronto')
    expect(n.text).not.toContain('conta a partir de agora')
  })
})

describe('inscrição aprovada', () => {
  const m = buildFormEmail({ outbox_id: 'f1', template: 'submission_approved', to_email: 'a@b.com', name: 'Maria', org: { name: 'Cordão da Tia Juca' },
    settings: { pix_key: null, pix_beneficiary: null, public_site_url: null, contact_whatsapp: '5521990698483', contact_email: 'contato@ex.com', directors: [], mail_from_name: null, mail_from_email: null } })
  it('rejeição usa o texto escrito pela Direção', () => {
    const r = buildFormEmail({ outbox_id: 'f2', template: 'submission_rejected', to_email: 'a@b.com', name: 'Zé', message: 'Linha um.\nLinha dois.', org: { name: 'Cordão' },
      settings: null })
    expect(r.subject).toBe('Sobre a sua inscrição — Cordão')
    for (const part of ['Linha um.', 'Linha dois.']) expect(r.text).toContain(part)
  })
  it('formatação do texto vira HTML seguro e texto limpo', () => {
    const r = buildFormEmail({ outbox_id: 'f4', template: 'submission_approved', to_email: 'a@b.com', name: 'Ana', org: { name: 'Cordão' }, settings: null,
      message: 'Olhe **isto** e *aquilo* e [o site](https://ex.com/a).\n- item um\n- item <b>dois</b>\n<script>x</script>' })
    expect(r.html).toContain('<strong>isto</strong>')
    expect(r.html).toContain('<em>aquilo</em>')
    expect(r.html).toContain('<a href="https://ex.com/a"')
    expect(r.html).toContain('<li>item um</li>')
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;b&gt;dois&lt;/b&gt;')
    expect(r.text).toContain('o site (https://ex.com/a)')
    expect(r.text).not.toContain('**')
  })
  it('lista de espera: assunto próprio, sem posição na fila', () => {
    const r = buildFormEmail({ outbox_id: 'f3', template: 'submission_waitlist', to_email: 'a@b.com', name: 'Ana', org: { name: 'Cordão' }, settings: null })
    expect(r.subject).toBe('Sua inscrição está na lista de espera — Cordão')
    expect(r.text).toContain('lista de espera')
    expect(r.text).not.toMatch(/posição|n[ºo] d/i)
  })
  it('assunto, saudação, aprovação e contatos', () => {
    expect(m.subject).toBe('Inscrição aprovada — Cordão da Tia Juca')
    for (const part of ['Olá, Maria!', 'foi aprovada', 'wa.me/5521990698483', 'contato@ex.com']) { expect(m.html).toContain(part); expect(m.text).toContain(part) }
  })
})
