import { describe, expect, it } from 'vitest'
import { availableMethods, checkoutBlockers, directorLinks, pixInstructions, type ContactInfo } from './pix'

const pix = { key: 'pix@bloco.com', beneficiary: 'Bloco' }
const contact: ContactInfo = { whatsapp: '5521999998888', email: 'loja@bloco.com', directors: [] }

describe('Pix manual', () => {
  it('mostra chave, valor exato e código do pedido como referência', () => {
    const p = pixInstructions({ pix, contact, orderCode: 'HN5XCGA4', totalCents: 15500, customerName: 'Maria' })
    expect(p.key).toBe('pix@bloco.com')
    expect(p.beneficiary).toBe('Bloco')
    expect(p.amountCents).toBe(15500)
    expect(p.amountText.replace(/\s/g, ' ')).toBe('R$ 155,00')
    expect(p.reference).toBe('HN5XCGA4')
  })
  it('monta WhatsApp e e-mail com o código e o valor no texto do comprovante', () => {
    const p = pixInstructions({ pix, contact, orderCode: 'HN5XCGA4', totalCents: 5400, customerName: 'João & Cia' })
    expect(p.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5521999998888\?text=/)
    expect(decodeURIComponent(p.whatsappUrl!.split('text=')[1])).toContain('HN5XCGA4')
    expect(p.whatsappUrl).toContain(encodeURIComponent('João & Cia'))
    expect(p.mailtoUrl).toMatch(/^mailto:loja@bloco\.com\?subject=/)
    expect(p.mailtoUrl).toContain(encodeURIComponent('Comprovante do pedido HN5XCGA4'))
  })
  it('sem WhatsApp/e-mail configurados não gera links', () => {
    const p = pixInstructions({ pix, contact: { whatsapp: null, email: null, directors: [] }, orderCode: 'AAAAAAAA', totalCents: 100, customerName: 'X' })
    expect(p.whatsappUrl).toBeNull()
    expect(p.mailtoUrl).toBeNull()
  })
})

describe('métodos disponíveis e bloqueios de checkout', () => {
  it('só oferece o que a loja habilitou E o sistema implementa', () => {
    expect(availableMethods(['pix', 'infinitepay'])).toEqual(['pix', 'infinitepay'])
    expect(availableMethods(['infinitepay'])).toEqual(['infinitepay'])
    expect(availableMethods(['pix', 'boleto'])).toEqual(['pix'])
    expect(availableMethods([])).toEqual([])
  })
  it('bloqueia a venda por Pix sem chave ou sem nenhum contato', () => {
    expect(checkoutBlockers('pix', { pix, contact })).toEqual([])
    expect(checkoutBlockers('pix', { pix: null, contact })).toHaveLength(1)
    expect(checkoutBlockers('pix', { pix, contact: { whatsapp: null, email: null, directors: [] } })).toHaveLength(1)
    expect(checkoutBlockers('pix', { pix, contact: { whatsapp: null, email: 'a@b.com', directors: [] } })).toEqual([])
    expect(checkoutBlockers('infinitepay', { pix: null, contact })).toEqual([])
  })
})

describe('contato com a Direção', () => {
  const directors = [{ name: 'Rafael', whatsapp: '5521996134845' }, { name: 'Maira', whatsapp: '5521984843223' }]
  it('gera um link de WhatsApp por pessoa, citando o pedido', () => {
    const links = directorLinks({ ...contact, directors }, 'HN5XCGA4')
    expect(links.map((l) => l.name)).toEqual(['Rafael', 'Maira'])
    expect(links[0].url.startsWith('https://wa.me/5521996134845?text=')).toBe(true)
    expect(decodeURIComponent(links[0].url)).toContain('HN5XCGA4')
  })
  it('sem Direção configurada não gera links', () => {
    expect(directorLinks(contact)).toEqual([])
  })
})
