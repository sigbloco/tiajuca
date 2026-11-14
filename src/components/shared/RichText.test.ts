import { describe, expect, it } from 'vitest'
import { parseBlocks, parseInline } from './RichText'

describe('texto formatado', () => {
  it('negrito, itálico e link', () => {
    expect(parseInline('a **b** *c* [d](https://x.com) e')).toEqual([
      { t: 'text', s: 'a ' }, { t: 'b', s: 'b' }, { t: 'text', s: ' ' }, { t: 'i', s: 'c' }, { t: 'text', s: ' ' }, { t: 'a', s: 'd', href: 'https://x.com' }, { t: 'text', s: ' e' },
    ])
  })
  it('só aceita links https, http e mailto (nada de javascript:)', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', s: '[x](javascript:alert(1))' }])
  })
  it('agrupa linhas com "- " em lista e ignora linhas vazias', () => {
    expect(parseBlocks('Olá\n\n- um\n- dois\nfim')).toEqual([{ kind: 'p', text: 'Olá' }, { kind: 'ul', items: ['um', 'dois'] }, { kind: 'p', text: 'fim' }])
  })
})
