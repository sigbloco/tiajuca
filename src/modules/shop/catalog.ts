/** Regras puras do catálogo (sem rede), compartilhadas pelo painel e, nas próximas etapas, pela vitrine. Valores em CENTAVOS. */

export type ProductKind = 'stock' | 'made_to_order'

export interface VariantStock { stock: number | null; reserved: number; is_active: boolean }

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
  name: string; kind: ProductKind; priceCents: number | null; discountPct: number; leadTimeDays: number | null
  variants: { label: string; stock: number | null }[]
}

/** Erros de preenchimento do produto (lista vazia = pode salvar). */
export function validateProductDraft(d: ProductDraft): string[] {
  const errors: string[] = []
  if (!d.name.trim()) errors.push('Informe o nome do produto.')
  else if (!slugify(d.name)) errors.push('O nome precisa ter letras ou números.')
  if (!d.priceCents || d.priceCents <= 0) errors.push('Informe o preço público.')
  if (!(d.discountPct >= 0 && d.discountPct <= 100)) errors.push('O desconto de integrante deve ficar entre 0% e 100%.')
  if (d.kind === 'made_to_order' && (!d.leadTimeDays || d.leadTimeDays <= 0)) errors.push('Informe o prazo de produção (em dias).')
  const labels = d.variants.map((v) => v.label.trim().toLowerCase())
  if (d.variants.length === 0) errors.push('Cadastre ao menos uma variação (ex.: Único, ou os tamanhos).')
  else {
    if (labels.some((l) => !l)) errors.push('Toda variação precisa de um nome.')
    if (new Set(labels).size !== labels.length) errors.push('Há variações com o mesmo nome.')
  }
  if (d.kind === 'stock' && d.variants.some((v) => v.stock === null || !Number.isInteger(v.stock) || v.stock < 0)) errors.push('Informe o estoque (0 ou mais) de cada variação.')
  return errors
}
