import { useState } from 'react'
import { formatCents } from '@/core/format'
import { creditFeeCents, creditFees, creditTotalCents, formatPct } from '../payments/pix'
import { useStore } from './StoreContext'


/** Taxas da InfinitePay por parcela (configuradas no painel): percentual e acréscimo real em reais sobre o valor do pedido. */
export function CreditFeeTable({ cents }: { cents: number }) {
  const { store } = useStore()
  const fees = creditFees(store.credit_fees_pct)
  const [all, setAll] = useState(false)
  const rows = all ? fees : fees.slice(0, 3)
  return (
    <details className="rounded-lg bg-muted p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Taxa do cartão: à vista {formatPct(fees[0])} (+ {formatCents(creditFeeCents(cents, 1, fees))}){fees.length > 1 ? ' · ver parcelado' : ''}</summary>
      <p className="mt-2 text-muted-foreground">A InfinitePay cobra a taxa de quem paga no cartão. No Pix não há taxa.</p>
      <table className="mt-2 w-full text-left">
        <thead><tr className="text-muted-foreground"><th className="py-1 font-normal">Parcelas</th><th className="font-normal">Taxa</th><th className="font-normal">Acréscimo</th><th className="text-right font-normal">Total</th></tr></thead>
        <tbody>
          {rows.map((pct, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{i + 1}x</td><td>{formatPct(pct)}</td><td className="whitespace-nowrap">+ {formatCents(creditFeeCents(cents, i + 1, fees))}</td><td className="whitespace-nowrap text-right font-semibold">{formatCents(creditTotalCents(cents, i + 1, fees))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fees.length > 3 && <button type="button" className="mt-2 font-semibold text-primary hover:underline" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Mostrar até ${fees.length}x`}</button>}
    </details>
  )
}
