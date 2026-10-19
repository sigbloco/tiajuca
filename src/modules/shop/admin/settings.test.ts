import { describe, expect, it } from 'vitest'
import { toSettings, validatePayments } from './settings'

describe('formulário de pagamentos', () => {
  it('aceita só Pix sem InfiniteTag', () => {
    expect(validatePayments({ pix: true, infinitepay: false, handle: '', siteUrl: '' })).toEqual([])
  })
  it('exige ao menos uma forma de pagamento', () => {
    expect(validatePayments({ pix: false, infinitepay: false, handle: '', siteUrl: '' })).toHaveLength(1)
  })
  it('InfinitePay ativa exige InfiniteTag válida e endereço do site', () => {
    expect(validatePayments({ pix: true, infinitepay: true, handle: '', siteUrl: '' })).toHaveLength(2)
    expect(validatePayments({ pix: true, infinitepay: true, handle: 'a b', siteUrl: 'tiajuca.com' })).toHaveLength(2)
    expect(validatePayments({ pix: true, infinitepay: true, handle: '$tiajuca', siteUrl: 'https://tiajuca.com/' })).toEqual([])
  })
  it('normaliza: tira o $ da tag e a barra final do site; só envia os métodos marcados', () => {
    expect(toSettings({ pix: true, infinitepay: true, handle: ' $tiajuca ', siteUrl: ' https://tiajuca.com// ' })).toEqual({
      payment_methods: ['pix', 'infinitepay'], infinitepay_handle: 'tiajuca', public_site_url: 'https://tiajuca.com',
    })
    expect(toSettings({ pix: true, infinitepay: false, handle: '', siteUrl: '' })).toEqual({
      payment_methods: ['pix'], infinitepay_handle: null, public_site_url: null,
    })
  })
})
