import { formatCurrency } from '@/core/format'
import { fromCents } from '../catalog'
import { CREDIT_FEES_PCT, creditFeeCents, creditTotalCents, formatPct } from '../payments/pix'

const money = (c: number) => formatCurrency(fromCents(c))

/** Taxas oficiais da InfinitePay por parcela: percentual e acréscimo real em reais sobre o valor do pedido. */
export function CreditFeeTable({ cents }: { cents: number }) {
  return (
    <details className="rounded-lg bg-muted p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Taxa do cartão: à vista {formatPct(CREDIT_FEES_PCT[0])} (+ {money(creditFeeCents(cents))}) · ver parcelado</summary>
      <p className="mt-2 text-muted-foreground">A InfinitePay cobra a taxa de quem paga no cartão. No Pix não há taxa.</p>
      <table className="mt-2 w-full text-left">
        <thead><tr className="text-muted-foreground"><th className="py-1 font-normal">Parcelas</th><th className="font-normal">Taxa</th><th className="font-normal">Acréscimo</th><th className="text-right font-normal">Total</th></tr></thead>
        <tbody>
          {CREDIT_FEES_PCT.map((pct, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{i + 1}x</td><td>{formatPct(pct)}</td><td>+ {money(creditFeeCents(cents, i + 1))}</td><td className="text-right font-semibold">{money(creditTotalCents(cents, i + 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
