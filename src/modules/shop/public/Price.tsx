import { formatCurrency } from '@/core/format'
import { buyerPriceCents, fromCents } from '../catalog'
import type { StoreProduct } from '../cart'
import { useStore } from './StoreContext'

/**
 * Visitante vê só o preço público; integrante ativo logado vê o público riscado e o preço dele;
 * direção, professores e monitores veem o preço especial (quando o produto tem um).
 */
export function Price({ product, isMember }: { product: Pick<StoreProduct, 'price_cents' | 'member_discount_pct' | 'special_price_cents'>; isMember: boolean }) {
  const { isSpecial } = useStore()
  const pub = formatCurrency(fromCents(product.price_cents))
  const mine = buyerPriceCents(product, { isMember, isSpecial })
  if (isMember && mine < product.price_cents) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-2">
        <s className="text-sm text-muted-foreground">{pub}</s>
        <strong className="text-lg text-primary">{formatCurrency(fromCents(mine))}</strong>
      </span>
    )
  }
  return <strong className="text-lg">{pub}</strong>
}
