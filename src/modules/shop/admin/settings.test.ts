import { describe, expect, it } from 'vitest'
import { EMPTY_SETTINGS, fromSettings, missingSetup, toSettings, toWaDigits, validateSettings, type SettingsForm } from './settings'

const ok: SettingsForm = {
  pix: true, pixKey: 'pix@bloco.com', pixBeneficiary: 'Rafael', infinitepay: false, handle: '', siteUrl: '',
  whatsapp: '(21) 99069-8483', email: 'loja@bloco.com', directors: [{ name: 'Rafael', phone: '(21) 99613-4845' }], mailFromName: 'Bloco', mailFromEmail: 'loja@bloco.com',
}

describe('telefones', () => {
  it('converte para o formato do WhatsApp (55 + DDD + número) e rejeita inválidos', () => {
    expect(toWaDigits('(21) 99069-8483')).toBe('5521990698483')
    expect(toWaDigits('5521990698483')).toBe('5521990698483')
    expect(toWaDigits('2133334444')).toBe('552133334444')
    expect(toWaDigits('99069')).toBeNull()
    expect(toWaDigits('')).toBeNull()
  })
})

describe('formulário de pagamentos e contatos', () => {
  it('aceita um formulário completo só com Pix', () => expect(validateSettings(ok)).toEqual([]))
  it('exige ao menos uma forma de pagamento', () => {
    expect(validateSettings({ ...ok, pix: false, infinitepay: false })).toContain('Deixe pelo menos uma forma de pagamento ativa.')
  })
  it('Pix ativo exige chave e favorecido', () => {
    expect(validateSettings({ ...ok, pixKey: '', pixBeneficiary: '' })).toHaveLength(2)
  })
  it('InfinitePay ativa exige InfiniteTag válida e endereço do site', () => {
    expect(validateSettings({ ...ok, infinitepay: true, handle: '', siteUrl: '' })).toHaveLength(2)
    expect(validateSettings({ ...ok, infinitepay: true, handle: 'a b', siteUrl: 'tiajuca.com' })).toHaveLength(2)
    expect(validateSettings({ ...ok, infinitepay: true, handle: '$tiajuca', siteUrl: 'https://tiajuca.com/' })).toEqual([])
  })
  it('exige pelo menos um contato e valida WhatsApp, e-mail e Direção', () => {
    expect(validateSettings({ ...ok, whatsapp: '', email: '' })).toHaveLength(1)
    expect(validateSettings({ ...ok, whatsapp: '123' })).toHaveLength(1)
    expect(validateSettings({ ...ok, email: 'sem-arroba' })).toHaveLength(1)
    expect(validateSettings({ ...ok, directors: [{ name: 'Maira', phone: '12' }] })).toHaveLength(1)
    expect(validateSettings({ ...ok, directors: [{ name: '', phone: '(21) 99613-4845' }] })).toHaveLength(1)
    expect(validateSettings({ ...ok, mailFromEmail: 'x' })).toHaveLength(1)
  })
  it('normaliza ao salvar e é reversível ao carregar', () => {
    const s = toSettings({ ...ok, infinitepay: true, handle: ' $tiajuca ', siteUrl: ' https://tiajuca.com// ' })
    expect(s).toMatchObject({
      payment_methods: ['pix', 'infinitepay'], infinitepay_handle: 'tiajuca', public_site_url: 'https://tiajuca.com',
      contact_whatsapp: '5521990698483', directors: [{ name: 'Rafael', whatsapp: '5521996134845' }],
    })
    expect(fromSettings(s).whatsapp).toBe('(21) 99069-8483')
    expect(fromSettings(s).directors).toEqual([{ name: 'Rafael', phone: '(21) 99613-4845' }])
    expect(toSettings({ ...ok, whatsapp: '', directors: [] }).contact_whatsapp).toBeNull()
  })
})

describe('o que falta configurar', () => {
  it('lista pendências e some quando tudo está preenchido', () => {
    expect(missingSetup(EMPTY_SETTINGS)).toHaveLength(3)
    expect(missingSetup(toSettings(ok))).toEqual([])
    expect(missingSetup({ ...toSettings(ok), pix_key: null })).toContain('Nenhuma forma de pagamento pronta (Pagamentos e contatos).')
  })
})
