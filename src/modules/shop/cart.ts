import { memberPriceCents, type ProductKind } from './catalog'

/** Carrinho puro (sem rede/React). O servidor SEMPRE recalcula preço e estoque no checkout; aqui é só para exibir e limitar. */

export const MAX_QTY_PER_LINE = 20

export interface CartLine { variantId: string; quantity: number }

export interface StoreVariant { id: string; label: string; available: number | null } // null = sob encomenda
export interface StoreProduct {
  id: string; slug: string; name: string; description: string; kind: ProductKind
  price_cents: number; member_discount_pct: number; lead_time_days: number | null
  images: string[]; variants: StoreVariant[]
}
export interface CatalogEntry { product: StoreProduct; variant: StoreVariant }
export type CatalogIndex = Map<string, CatalogEntry>

export function indexCatalog(products: StoreProduct[]): CatalogIndex {
  const idx: CatalogIndex = new Map()
  for (const product of products) for (const variant of product.variants) idx.set(variant.id, { product, variant })
  return idx
}

/** Quanto desta variação ainda cabe no carrinho (estoque disponível, limitado ao máximo por linha). */
export function maxQuantity(entry: CatalogEntry): number {
  return Math.min(MAX_QTY_PER_LINE, entry.variant.available ?? MAX_QTY_PER_LINE)
}

export function addToCart(lines: CartLine[], variantId: string, qty: number, index: CatalogIndex): CartLine[] {
  const entry = index.get(variantId)
  if (!entry || !Number.isInteger(qty) || qty <= 0) return lines
  const max = maxQuantity(entry)
  const current = lines.find((l) => l.variantId === variantId)?.quantity ?? 0
  const next = Math.min(max, current + qty)
  if (next <= 0) return lines
  return current ? lines.map((l) => (l.variantId === variantId ? { ...l, quantity: next } : l)) : [...lines, { variantId, quantity: next }]
}

export function setQuantity(lines: CartLine[], variantId: string, qty: number, index: CatalogIndex): CartLine[] {
  const entry = index.get(variantId)
  if (!entry || !Number.isFinite(qty) || qty <= 0) return lines.filter((l) => l.variantId !== variantId)
  const q = Math.min(maxQuantity(entry), Math.floor(qty))
  return q <= 0 ? lines.filter((l) => l.variantId !== variantId) : lines.map((l) => (l.variantId === variantId ? { ...l, quantity: q } : l))
}

export const removeLine = (lines: CartLine[], variantId: string): CartLine[] => lines.filter((l) => l.variantId !== variantId)

/** Confere o carrinho guardado contra o catálogo atual: tira o que sumiu/esgotou e reduz o que passa do estoque. */
export function reconcileCart(lines: CartLine[], index: CatalogIndex): { lines: CartLine[]; notices: string[] } {
  const out: CartLine[] = []
  const notices: string[] = []
  const seen = new Set<string>()
  for (const l of lines) {
    if (seen.has(l.variantId)) continue
    seen.add(l.variantId)
    const entry = index.get(l.variantId)
    if (!entry) { notices.push('Um item do carrinho não está mais à venda e foi removido.'); continue }
    const label = `${entry.product.name} (${entry.variant.label})`
    const max = maxQuantity(entry)
    if (max <= 0) { notices.push(`${label} esgotou e foi removido do carrinho.`); continue }
    const q = Math.min(max, Math.max(1, Math.floor(l.quantity) || 1))
    if (q < l.quantity) notices.push(`${label}: só restam ${q} unidade(s); a quantidade foi ajustada.`)
    out.push({ variantId: l.variantId, quantity: q })
  }
  return { lines: out, notices }
}

export interface PricedLine {
  variantId: string; productId: string; slug: string; name: string; variantLabel: string; kind: ProductKind; image: string | null
  quantity: number; unitPriceCents: number; unitFinalCents: number; lineTotalCents: number
}
export interface PricedCart {
  lines: PricedLine[]; subtotalCents: number; discountCents: number; totalCents: number; itemCount: number
  hasStock: boolean; hasMadeToOrder: boolean
}

/** Totais para exibição. `isMember` = integrante ATIVO logado (o servidor confirma isso de verdade no checkout). */
export function priceCart(lines: CartLine[], index: CatalogIndex, isMember: boolean): PricedCart {
  const priced: PricedLine[] = []
  for (const l of lines) {
    const e = index.get(l.variantId)
    if (!e) continue
    const unitFinal = isMember ? memberPriceCents(e.product.price_cents, e.product.member_discount_pct) : e.product.price_cents
    priced.push({
      variantId: l.variantId, productId: e.product.id, slug: e.product.slug, name: e.product.name, variantLabel: e.variant.label, kind: e.product.kind,
      image: e.product.images[0] ?? null, quantity: l.quantity, unitPriceCents: e.product.price_cents, unitFinalCents: unitFinal, lineTotalCents: unitFinal * l.quantity,
    })
  }
  const subtotal = priced.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
  const total = priced.reduce((s, l) => s + l.lineTotalCents, 0)
  return {
    lines: priced, subtotalCents: subtotal, discountCents: subtotal - total, totalCents: total,
    itemCount: priced.reduce((s, l) => s + l.quantity, 0),
    hasStock: priced.some((l) => l.kind === 'stock'), hasMadeToOrder: priced.some((l) => l.kind === 'made_to_order'),
  }
}
