import { describe, expect, it } from 'vitest'
import { initialsOf, neutralTone } from './photos'

describe('iniciais (como o Google)', () => {
  it('primeira letra do primeiro nome e do último sobrenome', () => {
    expect(initialsOf('Rafael Braz')).toBe('RB')
    expect(initialsOf('Ana Maria da Silva')).toBe('AS')
    expect(initialsOf('maria de souza')).toBe('MS')
  })
  it('um nome só vale uma letra; vazio vira ?', () => {
    expect(initialsOf('Maira')).toBe('M')
    expect(initialsOf('  ')).toBe('?')
    expect(initialsOf(null)).toBe('?')
  })
  it('acentuadas ficam maiúsculas', () => expect(initialsOf('élida ávila')).toBe('ÉÁ'))
})

describe('tom neutro', () => {
  it('o mesmo nome sempre cai no mesmo tom', () => expect(neutralTone('Rafael Braz')).toEqual(neutralTone('rafael braz')))
  it('sempre devolve fundo e letra', () => { const t = neutralTone('x'); expect(t.bg).toMatch(/^#/); expect(t.fg).toMatch(/^#/) })
})

describe('iniciais ignoram o apelido e símbolos', () => {
  it('apelido entre parênteses não entra', () => {
    expect(initialsOf('Rafael Braz (Rafa)')).toBe('RB')
    expect(initialsOf('Rafael (Rafa)')).toBe('R')
    expect(initialsOf('Rafael (')).toBe('R')
  })
  it('palavras sem letra no início são ignoradas', () => expect(initialsOf('Ana - Souza')).toBe('AS'))
})
