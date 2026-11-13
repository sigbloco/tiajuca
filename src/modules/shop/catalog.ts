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
  variants: { label: string; items: number }[]
}

/** Erros de preenchimento do produto (lista vazia = pode salvar). */
export function validateProductDraft(d: ProductDraft): string[] {
  const errors: string[] = []
  if (!d.name.trim()) errors.push('Informe o nome do produto.')
  else if (!slugify(d.name)) errors.push('O nome precisa ter letras ou números.')
  if (!d.priceCents || d.priceCents <= 0) errors.push('Informe o preço público.')
  if (!(d.discountPct >= 0 && d.discountPct <= 100)) errors.push('O desconto de integrante deve ficar entre 0% e 100%.')
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
