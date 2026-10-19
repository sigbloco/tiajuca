import { formatCurrency } from '@/core/format'
import { fromCents, memberPriceCents } from '../catalog'
import type { StoreProduct } from '../cart'

/** Visitante vê só o preço público; integrante ativo logado vê o público riscado e o preço dele. */
export function Price({ product, isMember }: { product: Pick<StoreProduct, 'price_cents' | 'member_discount_pct'>; isMember: boolean }) {
  const pub = formatCurrency(fromCents(product.price_cents))
  if (isMember && product.member_discount_pct > 0) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-2">
        <s className="text-sm text-muted-foreground">{pub}</s>
        <strong className="text-lg text-primary">{formatCurrency(fromCents(memberPriceCents(product.price_cents, product.member_discount_pct)))}</strong>
      </span>
    )
  }
  return <strong className="text-lg">{pub}</strong>
}
