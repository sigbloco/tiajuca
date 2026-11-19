/** Regras puras do catálogo (sem rede), compartilhadas pelo painel e, nas próximas etapas, pela vitrine. Valores em CENTAVOS. */

export type ProductKind = 'stock' | 'made_to_order'

export interface VariantStock { stock: number | null; reserved: number; is_active: boolean }

/** No painel o estoque vai de -1 a 99: -1 = ilimitado (guardado como nulo), 0 = esgotado. */
export const stockToDb = (ui: number): number | null => (ui === -1 ? null : ui)
export const stockFromDb = (db: number | null): number => (db === null ? -1 : db)

export const toCents = (reais: number): number => Math.round(reais * 100)
export const fromCents = (cents: number): number => cents / 100

/** Preço de integrante ativo: desconto % sobre o preço público, arredondado ao centavo. */
export function memberPriceCents(priceCents: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct))
  return Math.round((priceCents * (100 - pct)) / 100)
}

/**
 * Preço de quem compra: direção, professores e monitores pagam o preço especial (valor em reais digitado no produto, se houver);
 * os demais integrantes ativos pagam o desconto %; visitante paga o público. O servidor repete esta regra no checkout.
 */
export function buyerPriceCents(
  p: { price_cents: number; member_discount_pct: number; special_price_cents?: number | null },
  who: { isMember: boolean; isSpecial?: boolean },
): number {
  if (who.isSpecial && p.special_price_cents) return Math.min(p.special_price_cents, p.price_cents)
  return who.isMember ? memberPriceCents(p.price_cents, p.member_discount_pct) : p.price_cents
}

/** Contador "faltam N" da meta mínima. `visible` segue as opções do produto; `urgent` = falta pouco (destaque). */
export function remainingView(p: { min_units?: number | null; confirmed_units?: number | null; show_remaining?: boolean | null; show_remaining_when?: number | null }) {
  const min = p.min_units ?? 0
  if (!min) return null
  const done = p.confirmed_units ?? 0
  const remaining = Math.max(0, min - done)
  const when = p.show_remaining_when ?? null
  const visible = (p.show_remaining ?? true) && (when === null || remaining <= when)
  const urgent = remaining > 0 && remaining <= (when ?? Math.max(1, Math.ceil(min * 0.2)))
  return { min, done, remaining, reached: remaining === 0, visible, urgent }
}

/** Unidades que ainda podem ser vendidas de uma variação em estoque (nunca negativo). */
export function availableUnits(v: Pick<VariantStock, 'stock' | 'reserved'>): number {
  return v.stock === null ? Infinity : Math.max(0, v.stock - v.reserved)
}

export type Availability = { status: 'available'; units: number | null } | { status: 'sold_out' }

/** Sob encomenda sempre disponível; em estoque, só enquanto houver unidade em alguma variação ativa. */
export function productAvailability(kind: ProductKind, variants: VariantStock[]): Availability {
  if (kind === 'made_to_order') return { status: 'available', units: null }
  const units = variants.filter((v) => v.is_active).reduce((sum, v) => sum + availableUnits(v), 0)
  return units > 0 ? { status: 'available', units } : { status: 'sold_out' }
}

export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export interface ProductDraft {
  name: string; kind: ProductKind; priceCents: number | null; discountPct: number; leadTimeDays: string | null
  specialPriceCents?: number | null
  variants: { label: string; items: number }[]
}

/** Erros de preenchimento do produto (lista vazia = pode salvar). */
export function validateProductDraft(d: ProductDraft): string[] {
  const errors: string[] = []
  if (!d.name.trim()) errors.push('Informe o nome do produto.')
  else if (!slugify(d.name)) errors.push('O nome precisa ter letras ou números.')
  if (!d.priceCents || d.priceCents <= 0) errors.push('Informe o preço público.')
  if (!(d.discountPct >= 0 && d.discountPct <= 100)) errors.push('O desconto de integrante deve ficar entre 0% e 100%.')
  if (d.specialPriceCents != null && (d.specialPriceCents <= 0 || (d.priceCents && d.specialPriceCents >= d.priceCents))) errors.push('O preço especial deve ser maior que zero e menor que o preço público.')
  if (d.kind === 'made_to_order' && !d.leadTimeDays?.trim()) errors.push('Informe o prazo de produção (ex.: 10-15 dias úteis).')
  const labels = d.variants.map((v) => v.label.trim().toLowerCase())
  if (d.variants.length === 0) errors.push('Cadastre ao menos uma variação (ex.: Único, ou os tamanhos).')
  else {
    if (labels.some((l) => !l)) errors.push('Toda variação precisa de um nome.')
    if (new Set(labels).size !== labels.length) errors.push('Há variações com o mesmo nome.')
  }
  if (d.kind === 'stock' && d.variants.some((v) => v.items < 1)) errors.push('Escolha ao menos um item de estoque para cada variação.')
  return errors
}

/** Quantas unidades de uma variação os itens de estoque permitem (Infinity = só itens ilimitados; 0 = falta item, item inativo ou sem item). */
export interface StockItemUnits { stock: number | null; reserved: number; is_active: boolean }
export function variantUnits(uses: { stock_item_id: string; quantity: number }[], items: Map<string, StockItemUnits>): number {
  if (uses.length === 0) return 0
  let min = Infinity
  for (const u of uses) {
    const it = items.get(u.stock_item_id)
    if (!it || !it.is_active) return 0
    min = Math.min(min, Math.floor(availableUnits(it) / u.quantity))
  }
  return min
}
