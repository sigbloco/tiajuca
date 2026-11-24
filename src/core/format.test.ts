import { describe, expect, it } from 'vitest'
import { plural, pluralWord } from './format'

describe('plural', () => {
  it('singular só para 1; zero e o resto no plural', () => {
    expect(plural(1, 'resposta', 'respostas')).toBe('1 resposta')
    expect(plural(0, 'resposta', 'respostas')).toBe('0 respostas')
    expect(plural(24, 'cobrança', 'cobranças')).toBe('24 cobranças')
  })
  it('frações abaixo de 2 ficam no singular, com vírgula', () => {
    expect(plural(1.5, 'bolsa integral', 'bolsas integrais')).toBe('1,5 bolsa integral')
    expect(plural(4.25, 'bolsa integral', 'bolsas integrais')).toBe('4,25 bolsas integrais')
  })
  it('milhar com ponto', () => {
    expect(plural(1234, 'registro', 'registros')).toBe('1.234 registros')
    expect(pluralWord(2, 'lotado', 'lotados')).toBe('lotados')
  })
})
