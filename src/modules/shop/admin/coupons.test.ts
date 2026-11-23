import { describe, expect, it } from 'vitest'
import { normalizeCode, parseDiscount, parseMaxUses, validCode } from './CouponsTab'

describe('cupons', () => {
  it('código: maiúsculas, sem espaços nem símbolos, de 3 a 30', () => {
    expect(normalizeCode('bloco 10!')).toBe('BLOCO10')
    expect(validCode('BLOCO10')).toBe(true)
    expect(validCode('AB')).toBe(false)
    expect(validCode('A'.repeat(31))).toBe(false)
    expect(validCode('')).toBe(false)
  })
  it('desconto: entre 0,01 e 100, com vírgula ou ponto', () => {
    expect(parseDiscount('10')).toBe(10)
    expect(parseDiscount('12,5')).toBe(12.5)
    expect(parseDiscount('100')).toBe(100)
    expect(parseDiscount('0')).toBeNull()
    expect(parseDiscount('100,1')).toBeNull()
    expect(parseDiscount('')).toBeNull()
    expect(parseDiscount('abc')).toBeNull()
  })
  it('limite de usos: vazio é sem limite; de 1 a 100000', () => {
    expect(parseMaxUses('')).toBeNull()
    expect(parseMaxUses('50')).toBe(50)
    expect(parseMaxUses('0')).toBeUndefined()
    expect(parseMaxUses('100001')).toBeUndefined()
    expect(parseMaxUses('1,5')).toBeUndefined()
  })
})
