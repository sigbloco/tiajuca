import { describe, expect, it } from 'vitest'
import { buildShopTheme, isHexColor, readableForeground } from './theme'

describe('cor do texto sobre o fundo', () => {
  it('fundo escuro → texto branco; fundo claro → texto escuro', () => {
    expect(readableForeground('#000000')).toBe('#FFFFFF')
    expect(readableForeground('#1E3A8A')).toBe('#FFFFFF')
    expect(readableForeground('#E93D2B')).toBe('#FFFFFF')
    expect(readableForeground('#FFFFFF')).toBe('#1A1A1A')
    expect(readableForeground('#DEE33B')).toBe('#1A1A1A')
    expect(readableForeground('#FFD700')).toBe('#1A1A1A')
  })
  it('valor inválido não quebra', () => {
    expect(readableForeground('vermelho')).toBe('#FFFFFF')
  })
})

describe('tema da loja', () => {
  const base = { primary: '#E93D2B', primaryForeground: '#FFFFFF', secondary: '#DEE33B', secondaryForeground: '#2B2B14' }
  it('sem cores próprias usa as do bloco', () => {
    expect(buildShopTheme(base, null)).toEqual(base)
    expect(buildShopTheme(base, { primary: null, secondary: null })).toEqual(base)
  })
  it('cor própria troca só a que foi definida e recalcula o texto', () => {
    const t = buildShopTheme(base, { primary: '#FFD700', secondary: null })
    expect(t.primary).toBe('#FFD700')
    expect(t.primaryForeground).toBe('#1A1A1A')
    expect(t.secondary).toBe(base.secondary)
    expect(t.secondaryForeground).toBe(base.secondaryForeground)
  })
  it('ignora cor malformada e aceita bloco sem tema', () => {
    expect(buildShopTheme(base, { primary: 'azul' })).toEqual(base)
    expect(buildShopTheme(undefined, { secondary: '#112233' })).toEqual({ secondary: '#112233', secondaryForeground: '#FFFFFF' })
    expect(isHexColor('#12abEF')).toBe(true)
    expect(isHexColor('12abEF')).toBe(false)
  })
})
