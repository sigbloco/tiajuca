import { describe, expect, it } from 'vitest'
import { MANAGED_VARS, applyThemeVars, areaOverrides, isHex, mix, resolveColors, textOn, themeVars, withAreaColors, type ThemeJson } from './themeModel'

const theme: ThemeJson = {
  primary: '#E93D2B', primaryForeground: '#FFFFFF', secondary: '#DEE33B', secondaryForeground: '#2B2B14', palette: ['#111111'],
  shop: { primary: '#1E3A8A', header: '#FFD700' }, site: { background: '#102030' },
}

describe('cores', () => {
  it('texto escuro em fundo claro, claro em fundo escuro (regra do app)', () => {
    expect(textOn('#FFFFFF')).toBe('#1c1c14')
    expect(textOn('#DEE33B')).toBe('#1c1c14')
    expect(textOn('#E93D2B')).toBe('#ffffff')
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('azul')).toBe('#ffffff')
  })
  it('mistura de cores e validação de hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mix('#FF0000', '#FF0000', 0.3)).toBe('#FF0000')
    expect(isHex('#12abEF')).toBe(true)
    expect(isHex('12abEF')).toBe(false)
    expect(isHex(null)).toBe(false)
  })
})

describe('áreas: geral, site e loja', () => {
  it('a loja herda o geral e sobrepõe só o que tem cor própria', () => {
    expect(resolveColors(theme, 'shop')).toEqual({ primary: '#1E3A8A', secondary: '#DEE33B', header: '#FFD700' })
    expect(resolveColors(theme, 'site')).toEqual({ primary: '#E93D2B', secondary: '#DEE33B', background: '#102030' })
    expect(resolveColors(theme, 'general')).toEqual({ primary: '#E93D2B', secondary: '#DEE33B' })
  })
  it('overrides mostra só o escolhido para a área', () => {
    expect(areaOverrides(theme, 'shop')).toEqual({ primary: '#1E3A8A', header: '#FFD700' })
    expect(areaOverrides(undefined, 'site')).toEqual({})
  })
  it('ignora cor inválida e normaliza para maiúsculas', () => {
    expect(areaOverrides({ shop: { primary: 'azul', secondary: '#abcdef' } }, 'shop')).toEqual({ secondary: '#ABCDEF' })
  })
})

describe('variáveis CSS', () => {
  it('só emite o que foi definido e calcula o texto sobre cada cor', () => {
    const v = themeVars({ primary: '#E93D2B', header: '#FFD700' })
    expect(v['--primary']).toBe('233 61 43')
    expect(v['--primary-foreground']).toBe('255 255 255')
    expect(v['--header']).toBe('255 215 0')
    expect(v['--header-foreground']).toBe('28 28 20')
    expect(v['--background']).toBeUndefined()
    expect(v['--secondary']).toBeUndefined()
  })
  it('respeita o texto explícito do tema antigo para primária/secundária', () => {
    const v = themeVars({ secondary: '#DEE33B' }, { secondary: '#2B2B14' })
    expect(v['--secondary-foreground']).toBe('43 43 20')
  })
  it('fundo escuro: texto claro, bordas/realces derivados, cartões e cabeçalho acompanham o tom', () => {
    const v = themeVars({ background: '#102030' })
    expect(v['--foreground']).toBe('255 255 255')
    expect(v['--muted']).toBeDefined()
    expect(v['--border']).toBeDefined()
    expect(v['--card']).not.toBe('255 255 255')
    expect(v['--card-foreground']).toBe('255 255 255')
    expect(v['--header']).toBe(v['--card'])
  })
  it('fundo claro: cartões brancos; cartão próprio vence o derivado', () => {
    expect(themeVars({ background: '#FFF8E7' })['--card']).toBe('255 255 255')
    const v = themeVars({ background: '#102030', card: '#FFFFFF' })
    expect(v['--card']).toBe('255 255 255')
    expect(v['--card-foreground']).toBe('28 28 20')
  })
})

describe('gravar cores no tema', () => {
  it('geral: grava no topo, recalcula os textos antigos e preserva site/loja/paleta', () => {
    const t = withAreaColors(theme, 'general', { primary: '#FFD700', background: '#FFF8E7' })
    expect(t.primary).toBe('#FFD700')
    expect(t.primaryForeground).toBe('#1c1c14')
    expect(t.secondary).toBeUndefined()
    expect(t.secondaryForeground).toBeUndefined()
    expect(t.background).toBe('#FFF8E7')
    expect(t.palette).toEqual(['#111111'])
    expect(t.shop).toEqual(theme.shop)
    expect(t.site).toEqual(theme.site)
  })
  it('loja/site: grava só na área; vazio apaga a área; não mexe no geral', () => {
    const t = withAreaColors(theme, 'shop', { card: '#EEEEEE' })
    expect(t.shop).toEqual({ card: '#EEEEEE' })
    expect(t.primary).toBe('#E93D2B')
    expect('shop' in withAreaColors(theme, 'shop', { primary: null, header: '' })).toBe(false)
    expect(withAreaColors(undefined, 'site', { header: '#123456' }).site).toEqual({ header: '#123456' })
  })
})

describe('aplicar e restaurar no elemento', () => {
  // Sem DOM no ambiente de teste: um elemento mínimo com a mesma interface de style usada pelo código.
  const fakeEl = () => {
    const props = new Map<string, string>()
    return { props, style: { getPropertyValue: (n: string) => props.get(n) ?? '', setProperty: (n: string, v: string) => { props.set(n, v) }, removeProperty: (n: string) => { props.delete(n) } } } as unknown as HTMLElement & { props: Map<string, string> }
  }
  it('define as variáveis, remove as que a área não usa e restaura o estado anterior', () => {
    const el = fakeEl()
    el.style.setProperty('--primary', '1 2 3')
    el.style.setProperty('--header', '9 9 9')
    const restore = applyThemeVars({ '--primary': '10 20 30' }, el)
    expect(el.style.getPropertyValue('--primary')).toBe('10 20 30')
    expect(el.style.getPropertyValue('--header')).toBe('')
    restore()
    expect(el.style.getPropertyValue('--primary')).toBe('1 2 3')
    expect(el.style.getPropertyValue('--header')).toBe('9 9 9')
    expect(MANAGED_VARS).toContain('--header')
  })
})
