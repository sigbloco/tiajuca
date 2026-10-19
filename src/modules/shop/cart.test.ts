import { describe, expect, it } from 'vitest'
import { MAX_QTY_PER_LINE, addToCart, indexCatalog, priceCart, reconcileCart, removeLine, setQuantity, type StoreProduct } from './cart'

const camisa: StoreProduct = {
  id: 'p1', slug: 'camisa', name: 'Camisa', description: '', kind: 'stock', price_cents: 6000, member_discount_pct: 10, lead_time_days: null, images: ['a.jpg'],
  variants: [{ id: 'v-m', label: 'M', available: 3 }, { id: 'v-g', label: 'G', available: 0 }],
}
const bone: StoreProduct = {
  id: 'p2', slug: 'bone', name: 'Boné', description: '', kind: 'made_to_order', price_cents: 3500, member_discount_pct: 0, lead_time_days: 15, images: [],
  variants: [{ id: 'v-u', label: 'Único', available: null }],
}
const idx = indexCatalog([camisa, bone])

describe('adicionar ao carrinho', () => {
  it('soma quantidades e limita ao estoque disponível', () => {
    let c = addToCart([], 'v-m', 2, idx)
    expect(c).toEqual([{ variantId: 'v-m', quantity: 2 }])
    c = addToCart(c, 'v-m', 5, idx)
    expect(c).toEqual([{ variantId: 'v-m', quantity: 3 }])
  })
  it('não adiciona esgotado, inexistente nem quantidade inválida', () => {
    expect(addToCart([], 'v-g', 1, idx)).toEqual([])
    expect(addToCart([], 'nada', 1, idx)).toEqual([])
    expect(addToCart([], 'v-m', 0, idx)).toEqual([])
    expect(addToCart([], 'v-m', 1.5, idx)).toEqual([])
  })
  it('sob encomenda não tem estoque, mas respeita o máximo por linha', () => {
    expect(addToCart([], 'v-u', 100, idx)).toEqual([{ variantId: 'v-u', quantity: MAX_QTY_PER_LINE }])
  })
})

describe('alterar e remover', () => {
  it('setQuantity ajusta, limita e remove ao zerar', () => {
    const c = [{ variantId: 'v-m', quantity: 1 }]
    expect(setQuantity(c, 'v-m', 2, idx)).toEqual([{ variantId: 'v-m', quantity: 2 }])
    expect(setQuantity(c, 'v-m', 99, idx)).toEqual([{ variantId: 'v-m', quantity: 3 }])
    expect(setQuantity(c, 'v-m', 0, idx)).toEqual([])
    expect(removeLine(c, 'v-m')).toEqual([])
  })
})

describe('conferir carrinho guardado', () => {
  it('remove item sumido/esgotado e reduz o que passa do estoque, avisando', () => {
    const r = reconcileCart([{ variantId: 'v-m', quantity: 9 }, { variantId: 'v-g', quantity: 1 }, { variantId: 'fantasma', quantity: 1 }, { variantId: 'v-u', quantity: 2 }], idx)
    expect(r.lines).toEqual([{ variantId: 'v-m', quantity: 3 }, { variantId: 'v-u', quantity: 2 }])
    expect(r.notices).toHaveLength(3)
  })
  it('descarta linhas repetidas e quantidades inválidas sem avisar à toa', () => {
    const r = reconcileCart([{ variantId: 'v-m', quantity: 1 }, { variantId: 'v-m', quantity: 2 }, { variantId: 'v-u', quantity: 0 }], idx)
    expect(r.lines).toEqual([{ variantId: 'v-m', quantity: 1 }, { variantId: 'v-u', quantity: 1 }])
    expect(r.notices).toEqual([])
  })
})

describe('totais', () => {
  const lines = [{ variantId: 'v-m', quantity: 2 }, { variantId: 'v-u', quantity: 1 }]
  it('visitante paga o preço público', () => {
    const c = priceCart(lines, idx, false)
    expect(c.subtotalCents).toBe(15500)
    expect(c.discountCents).toBe(0)
    expect(c.totalCents).toBe(15500)
    expect(c.itemCount).toBe(3)
    expect(c.hasStock && c.hasMadeToOrder).toBe(true)
  })
  it('integrante ativo recebe o desconto do produto (e só dele)', () => {
    const c = priceCart(lines, idx, true)
    expect(c.lines[0].unitFinalCents).toBe(5400)
    expect(c.lines[1].unitFinalCents).toBe(3500) // boné sem desconto
    expect(c.discountCents).toBe(1200)
    expect(c.totalCents).toBe(14300)
    expect(c.totalCents).toBe(c.subtotalCents - c.discountCents)
  })
  it('ignora variações que não existem mais', () => {
    expect(priceCart([{ variantId: 'x', quantity: 1 }], idx, false).totalCents).toBe(0)
  })
})
