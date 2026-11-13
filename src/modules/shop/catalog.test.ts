import { describe, expect, it } from 'vitest'
import { availableUnits, variantUnits, memberPriceCents, productAvailability, slugify, toCents, validateProductDraft, type ProductDraft } from './catalog'

const draft: ProductDraft = { name: 'Camisa 2027', kind: 'stock', priceCents: 6000, discountPct: 10, leadTimeDays: null, variants: [{ label: 'M', items: 1 }] }

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
    expect(validateProductDraft({ ...draft, kind: 'made_to_order', leadTimeDays: null, variants: [{ label: 'Único', items: 0 }] })).toEqual(['Informe o prazo de produção (ex.: 10-15 dias úteis).'])
    expect(validateProductDraft({ ...draft, kind: 'made_to_order', leadTimeDays: '10-15 dias úteis', variants: [{ label: 'Único', items: 0 }] })).toEqual([])
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', items: 0 }] })).toEqual(['Escolha ao menos um item de estoque para cada variação.'])
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', items: 2 }] })).toEqual([])
  })
  it('rejeita variações repetidas (sem diferenciar maiúsculas) e desconto fora da faixa', () => {
    expect(validateProductDraft({ ...draft, variants: [{ label: 'M', items: 1 }, { label: ' m ', items: 1 }] })).toEqual(['Há variações com o mesmo nome.'])
    expect(validateProductDraft({ ...draft, discountPct: 120 })).toHaveLength(1)
  })
})

describe('variantUnits', () => {
  const item = (stock: number | null, reserved = 0, is_active = true) => ({ stock, reserved, is_active })
  const map = new Map([['a', item(10, 2)], ['b', item(3)], ['c', item(null)], ['d', item(5, 0, false)]])
  it('kit é limitado pelo item que mais falta', () => {
    expect(variantUnits([{ stock_item_id: 'a', quantity: 2 }, { stock_item_id: 'b', quantity: 1 }], map)).toBe(3)
    expect(variantUnits([{ stock_item_id: 'a', quantity: 4 }], map)).toBe(2)
  })
  it('item ilimitado não limita; inativo, ausente ou nenhum item zera', () => {
    expect(variantUnits([{ stock_item_id: 'c', quantity: 2 }], map)).toBe(Infinity)
    expect(variantUnits([{ stock_item_id: 'd', quantity: 1 }], map)).toBe(0)
    expect(variantUnits([{ stock_item_id: 'x', quantity: 1 }], map)).toBe(0)
    expect(variantUnits([], map)).toBe(0)
  })
})
