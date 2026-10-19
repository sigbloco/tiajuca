import { describe, expect, it } from 'vitest'
import { parseShopConfig } from './schema'
import { getShopConfig } from './shop.config'

describe('configuração estática da loja', () => {
  it('aceita uma configuração válida', () => {
    expect(parseShopConfig({ orgSlug: 'tiajuca', reservationHours: 48 })).toEqual({ orgSlug: 'tiajuca', reservationHours: 48 })
  })

  it('rejeita slug e prazo inválidos, com mensagem que aponta o campo', () => {
    expect(() => parseShopConfig({ orgSlug: 'Tia Juca', reservationHours: 48 })).toThrow(/orgSlug/)
    expect(() => parseShopConfig({ orgSlug: 'tiajuca', reservationHours: 0 })).toThrow(/reservationHours/)
    expect(() => parseShopConfig({ orgSlug: 'tiajuca', reservationHours: 1.5 })).toThrow(/reservationHours/)
    expect(() => parseShopConfig(null)).toThrow(/inválida/)
  })

  it('a configuração real do projeto é válida e lida num único ponto', () => {
    expect(getShopConfig()).toBe(getShopConfig())
    expect(getShopConfig().orgSlug).toBe('tiajuca')
  })
})
