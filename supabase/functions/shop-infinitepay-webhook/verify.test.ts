import { describe, expect, it } from 'vitest'
import { isPaymentConfirmed, parseWebhook } from './verify'

const good = { invoice_slug: 'abc123', amount: 14300, paid_amount: 14300, installments: 1, capture_method: 'pix', transaction_nsu: 'tx-1', order_nsu: 'HN5XCGA4', receipt_url: 'https://r.infinitepay.io/x', items: [] }

describe('leitura do webhook', () => {
  it('extrai só o necessário', () => {
    expect(parseWebhook(good)).toEqual({
      order_nsu: 'HN5XCGA4', transaction_nsu: 'tx-1', invoice_slug: 'abc123', amount: 14300, paid_amount: 14300, capture_method: 'pix', receipt_url: 'https://r.infinitepay.io/x',
    })
  })
  it('rejeita corpo sem pedido/transação, código fora do padrão ou lixo', () => {
    expect(parseWebhook({ ...good, order_nsu: 'abc' })).toBeNull()
    expect(parseWebhook({ ...good, order_nsu: undefined })).toBeNull()
    expect(parseWebhook({ ...good, transaction_nsu: '' })).toBeNull()
    expect(parseWebhook({ ...good, invoice_slug: undefined })).toBeNull()
    expect(parseWebhook(null)).toBeNull()
    expect(parseWebhook('x')).toBeNull()
  })
  it('valores que não são inteiros viram null (não confiamos neles de qualquer forma)', () => {
    const w = parseWebhook({ ...good, amount: '14300', paid_amount: 1.5 })
    expect(w?.amount).toBeNull()
    expect(w?.paid_amount).toBeNull()
  })
})

describe('confirmação via payment_check', () => {
  it('aceita pago com valor igual ao total', () => {
    expect(isPaymentConfirmed({ success: true, paid: true, amount: 14300, paid_amount: 14300 }, 14300)).toBe(true)
  })
  it('aceita paid_amount maior (juros do parcelamento repassado ao cliente), nunca menor', () => {
    expect(isPaymentConfirmed({ success: true, paid: true, amount: 14300, paid_amount: 15000, installments: 3 }, 14300)).toBe(true)
    expect(isPaymentConfirmed({ success: true, paid: true, amount: 14300, paid_amount: 14000 }, 14300)).toBe(false)
  })
  it('recusa não pago, valor do link diferente do pedido, falha ou resposta estranha', () => {
    expect(isPaymentConfirmed({ success: true, paid: false, amount: 14300, paid_amount: 14300 }, 14300)).toBe(false)
    expect(isPaymentConfirmed({ success: true, paid: true, amount: 100, paid_amount: 100 }, 14300)).toBe(false)
    expect(isPaymentConfirmed({ success: false, paid: true, amount: 14300, paid_amount: 14300 }, 14300)).toBe(false)
    expect(isPaymentConfirmed({ paid: true }, 14300)).toBe(false)
    expect(isPaymentConfirmed(null, 14300)).toBe(false)
  })
})
