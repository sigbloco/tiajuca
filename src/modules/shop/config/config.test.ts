import { describe, expect, it } from 'vitest'
import { PENDING, findPendingFields, parseShopConfig } from './schema'
import { getShopConfig } from './shop.config'

const valid = {
  orgSlug: 'tiajuca', reservationHours: 48,
  pix: { key: 'chave@pix.com', beneficiary: 'Bloco' },
  contact: { whatsapp: '5521999998888', email: 'loja@bloco.com' },
  mail: { fromName: 'Bloco', fromEmail: 'loja@bloco.com' },
}

describe('configuração da loja', () => {
  it('aceita uma configuração completa e sem pendências', () => {
    const c = parseShopConfig(valid)
    expect(c.reservationHours).toBe(48)
    expect(findPendingFields(c)).toEqual([])
  })

  it('rejeita slug e prazo inválidos', () => {
    expect(() => parseShopConfig({ ...valid, orgSlug: 'Tia Juca' })).toThrow(/orgSlug/)
    expect(() => parseShopConfig({ ...valid, reservationHours: 0 })).toThrow(/reservationHours/)
  })

  it('rejeita WhatsApp com símbolos e e-mail malformado', () => {
    expect(() => parseShopConfig({ ...valid, contact: { ...valid.contact, whatsapp: '+55 (21) 99999-8888' } })).toThrow(/whatsapp/)
    expect(() => parseShopConfig({ ...valid, contact: { ...valid.contact, email: 'sem-arroba' } })).toThrow(/email/)
  })

  it('lista os campos ainda provisórios', () => {
    const pending = { ...valid, pix: { key: PENDING, beneficiary: PENDING }, contact: { whatsapp: PENDING, email: PENDING }, mail: { fromName: 'B', fromEmail: PENDING } }
    expect(findPendingFields(parseShopConfig(pending))).toEqual(['pix.key', 'pix.beneficiary', 'contact.whatsapp', 'contact.email', 'mail.fromEmail'])
  })

  it('a configuração real do projeto é válida e lida num único ponto', () => {
    expect(getShopConfig()).toBe(getShopConfig())
    expect(getShopConfig().orgSlug).toBe('tiajuca')
  })
})
