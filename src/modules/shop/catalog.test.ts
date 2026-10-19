import { describe, expect, it } from 'vitest'
import { availableUnits, memberPriceCents, productAvailability, slugify, toCents, validateProductDraft, type ProductDraft } from './catalog'

const draft: ProductDraft = { name: 'Camisa 2027', kind: 'stock', priceCents: 6000, discountPct: 10, leadTimeDays: null, variants: [{ label: 'M', stock: 5 }] }

describe('preço', () => {
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(toCents(59.9)).toBe(5990)
    expect(toCents(0.29)).toBe(29)
  })
  it('aplica o desconto de integrante e arredonda ao centavo', () => {
    expect(memberPriceCents(6000, 10)).toBe(5400)
    expect(memberPriceCents(3333, 10)).toBe(3000) // 2999,7 → 3000
    expect(memberPriceCents(5000, 0)).toBe(5000)
    expect(memberPriceCents(5000, 100)).toBe(0)
    expect(memberPriceCents(5000, 150)).toBe(0) // limita a 100%
    expect(memberPriceCents(5000, -5)).toBe(5000)
  })
})

describe('estoque', () => {
  it('disponível = estoque − reservado, nunca negativo', () => {
    expect(availableUnits({ stock: 10, reserved: 3 })).toBe(7)
    expect(availableUnits({ stock: 2, reserved: 2 })).toBe(0)
    expect(availableUnits({ stock: 1, reserved: 5 })).toBe(0)
  })
  it('sob encomenda não tem controle de estoque', () => {
    expect(availableUnits({ stock: null, reserved: 0 })).toBe(Infinity)
    expect(productAvailability('made_to_order', [])).toEqual({ status: 'available', units: null })
  })
  it('em estoque: soma só variações ativas; zerou = esgotado', () => {
    const v = (stock: number, reserved: number, is_active = true) => ({ stock, reserved, is_active })
    expect(productAvailability('stock', [v(5, 2), v(3, 0)])).toEqual({ status: 'available', units: 6 })
    expect(productAvailability('stock', [v(5, 5), v(3, 3)])).toEqual({ status: 'sold_out' })
    expect(productAvailability('stock', [v(5, 0, false)])).toEqual({ status: 'sold_out' })
    expect(productAvailability('stock', [])).toEqual({ status: 'sold_out' })
  })
})

describe('slug', () => {
  it('remove acentos e símbolos', () => {
    expect(slugify('Camisa Tia Juca — 2027!')).toBe('camisa-tia-juca-2027')
    expect(slugify('Pandeiro Açaí')).toBe('pandeiro-acai')
    expect(slugify('!!!')).toBe('')
  })
})

describe('validação do produto', () => {
  it('aceita um produto completo', () => expect(validateProductDraft(draft)).toEqual([]))
  it('exige nome, preço e variação', () => {
    expect(validateProductDraft({ ...draft, name: '  ', priceCents: null, variants: [] })).toHaveLength(3)
  })
  it('encomenda exige prazo; estoque exige quantidade', () => {
    expect(validateProductDraft({ ...draft, kind: 'made_to_order', leadTimeDays: null, variants: [{ label: 'Único', stock: null }] })).toEqual(['Informe o prazo de produção (em dias).'])
    expect(validateProductDraft({ ...draft, kind: 'made_to_order', leadTimeDays: 15, variants: [{ label: 'Único', stock: null }] })).toEqual([])
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', stock: null }] })).toEqual(['Informe o estoque (0 ou mais) de cada variação.'])
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', stock: -1 }] })).toHaveLength(1)
  })
  it('rejeita variações repetidas (sem diferenciar maiúsculas) e desconto fora da faixa', () => {
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', stock: 1 }, { label: ' m ', stock: 2 }] })).toEqual(['Há variações com o mesmo nome.'])
    expect(validateProductDraft({ ...draft, discountPct: 120 })).toHaveLength(1)
  })
})
