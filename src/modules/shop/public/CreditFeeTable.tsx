import { useState } from 'react'
import { formatCurrency } from '@/core/format'
import { fromCents } from '../catalog'
import { CREDIT_FEES_PCT, creditFeeCents, creditTotalCents, formatPct } from '../payments/pix'

const money = (c: number) => formatCurrency(fromCents(c))

/** Taxas oficiais da InfinitePay por parcela: percentual e acréscimo real em reais sobre o valor do pedido. */
export function CreditFeeTable({ cents }: { cents: number }) {
  const [all, setAll] = useState(false)
  const rows = all ? CREDIT_FEES_PCT : CREDIT_FEES_PCT.slice(0, 3)
  return (
    <details className="rounded-lg bg-muted p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Taxa do cartão: à vista {formatPct(CREDIT_FEES_PCT[0])} (+ {money(creditFeeCents(cents))}) · ver parcelado</summary>
      <p className="mt-2 text-muted-foreground">A InfinitePay cobra a taxa de quem paga no cartão. No Pix não há taxa.</p>
      <table className="mt-2 w-full text-left">
        <thead><tr className="text-muted-foreground"><th className="py-1 font-normal">Parcelas</th><th className="font-normal">Taxa</th><th className="font-normal">Acréscimo</th><th className="text-right font-normal">Total</th></tr></thead>
        <tbody>
          {rows.map((pct, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{i + 1}x</td><td>{formatPct(pct)}</td><td className="whitespace-nowrap">+ {money(creditFeeCents(cents, i + 1))}</td><td className="whitespace-nowrap text-right font-semibold">{money(creditTotalCents(cents, i + 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="mt-2 font-semibold text-primary hover:underline" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : 'Mostrar mais...'}</button>
    </details>
  )
}
