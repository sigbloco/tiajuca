import { describe, expect, it } from 'vitest'
import { PENDING, parseShopConfig } from '../config/schema'
import { availableMethods, checkoutBlockers, directorLinks, pixInstructions } from './pix'

const base = {
  orgSlug: 'tiajuca', reservationHours: 48, paymentMethods: ['pix', 'infinitepay'],
  pix: { key: 'pix@bloco.com', beneficiary: 'Bloco' },
  contact: { whatsapp: '5521999998888', email: 'loja@bloco.com' },
  mail: { fromName: 'Bloco', fromEmail: 'loja@bloco.com' },
}
const cfg = (over: Record<string, unknown> = {}) => parseShopConfig({ ...base, ...over })

describe('Pix manual', () => {
  it('mostra chave, valor exato e código do pedido como referência', () => {
    const p = pixInstructions({ config: cfg(), orderCode: 'HN5XCGA4', totalCents: 15500, customerName: 'Maria' })
    expect(p.key).toBe('pix@bloco.com')
    expect(p.amountCents).toBe(15500)
    expect(p.amountText.replace(/\s/g, ' ')).toBe('R$ 155,00')
    expect(p.reference).toBe('HN5XCGA4')
  })
  it('monta WhatsApp e e-mail com o código e o valor no texto do comprovante', () => {
    const p = pixInstructions({ config: cfg(), orderCode: 'HN5XCGA4', totalCents: 5400, customerName: 'João & Cia' })
    expect(p.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5521999998888\?text=/)
    expect(decodeURIComponent(p.whatsappUrl!.split('text=')[1])).toContain('HN5XCGA4')
    expect(p.whatsappUrl).toContain(encodeURIComponent('João & Cia'))
    expect(p.mailtoUrl).toMatch(/^mailto:loja@bloco\.com\?subject=/)
    expect(p.mailtoUrl).toContain(encodeURIComponent('Comprovante do pedido HN5XCGA4'))
  })
  it('sem WhatsApp/e-mail configurados não gera links', () => {
    const p = pixInstructions({ config: cfg({ contact: { whatsapp: PENDING, email: PENDING } }), orderCode: 'AAAAAAAA', totalCents: 100, customerName: 'X' })
    expect(p.whatsappUrl).toBeNull()
    expect(p.mailtoUrl).toBeNull()
  })
})

describe('métodos disponíveis e bloqueios de checkout', () => {
  it('só oferece o que está habilitado E implementado', () => {
    expect(availableMethods(cfg())).toEqual(['pix', 'infinitepay'])
    expect(availableMethods(cfg({ paymentMethods: ['infinitepay'] }))).toEqual(['infinitepay'])
    expect(availableMethods(cfg({ paymentMethods: ['pix'] }))).toEqual(['pix'])
  })
  it('bloqueia a venda por Pix sem chave ou sem nenhum contato', () => {
    expect(checkoutBlockers(cfg(), 'pix')).toEqual([])
    expect(checkoutBlockers(cfg({ pix: { key: PENDING, beneficiary: 'Bloco' } }), 'pix')).toHaveLength(1)
    expect(checkoutBlockers(cfg({ contact: { whatsapp: PENDING, email: PENDING } }), 'pix')).toHaveLength(1)
    expect(checkoutBlockers(cfg({ contact: { whatsapp: PENDING, email: 'a@b.com' } }), 'pix')).toEqual([])
  })
})

describe('contato com a Direção', () => {
  const directors = [{ name: 'Rafael', whatsapp: '5521996134845' }, { name: 'Maira', whatsapp: '5521984843223' }]
  it('gera um link de WhatsApp por pessoa, citando o pedido', () => {
    const links = directorLinks(cfg({ contact: { ...base.contact, directors } }), 'HN5XCGA4')
    expect(links.map((l) => l.name)).toEqual(['Rafael', 'Maira'])
    expect(links[0].url.startsWith('https://wa.me/5521996134845?text=')).toBe(true)
    expect(decodeURIComponent(links[0].url)).toContain('HN5XCGA4')
  })
  it('sem Direção configurada não gera links; número inválido é rejeitado', () => {
    expect(directorLinks(cfg())).toEqual([])
    expect(() => cfg({ contact: { ...base.contact, directors: [{ name: 'X', whatsapp: '21 99999' }] } })).toThrow(/directors/)
  })
})
