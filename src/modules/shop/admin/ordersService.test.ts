import { describe, expect, it } from 'vitest'
import { matchesOrder } from './ordersService'

const o = { code: 'HN5XCGA4', customer_name: 'Maria da Silva', customer_phone: '5521999998888', customer_email: 'Maria@Ex.com' }

describe('busca de pedidos', () => {
  it('encontra por código, nome, e-mail e telefone (com ou sem máscara)', () => {
    expect(matchesOrder(o, 'hn5x')).toBe(true)
    expect(matchesOrder(o, 'silva')).toBe(true)
    expect(matchesOrder(o, 'maria@ex')).toBe(true)
    expect(matchesOrder(o, '(21) 99999-8888')).toBe(true)
    expect(matchesOrder(o, '8888')).toBe(true)
  })
  it('vazio mostra tudo; números curtos não casam telefone por acaso; sem resultado devolve falso', () => {
    expect(matchesOrder(o, '  ')).toBe(true)
    expect(matchesOrder(o, '21')).toBe(false)
    expect(matchesOrder(o, 'joao')).toBe(false)
  })
})
