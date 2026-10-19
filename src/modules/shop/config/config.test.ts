import { describe, expect, it } from 'vitest'
import { parseShopConfig } from './schema'
import { getShopConfig } from './shop.config'

describe('configuração estática da loja', () => {
  it('aceita uma configuração válida', () => {
    expect(parseShopConfig({ orgSlug: 'tiajuca' })).toEqual({ orgSlug: 'tiajuca' })
  })

  it('rejeita slug inválido, com mensagem que aponta o campo', () => {
    expect(() => parseShopConfig({ orgSlug: 'Tia Juca' })).toThrow(/orgSlug/)
    expect(() => parseShopConfig({})).toThrow(/orgSlug/)
    expect(() => parseShopConfig(null)).toThrow(/inválida/)
  })

  it('a configuração real do projeto é válida e lida num único ponto', () => {
    expect(getShopConfig()).toBe(getShopConfig())
    expect(getShopConfig().orgSlug).toBe('tiajuca')
  })
})
