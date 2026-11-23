import { Tag, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Input } from '@/components/ui/primitives'
import { useStore } from './StoreContext'

/** "Tenho um cupom": código + Aplicar; depois mostra o cupom aplicado com o X para tirar. O servidor confere de novo ao finalizar. */
export function CouponBox() {
  const { coupon, applyCoupon, clearCoupon, cart } = useStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (coupon) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 font-semibold"><Tag className="h-4 w-4 shrink-0 text-primary" aria-hidden /> <span className="break-all tracking-wider">{coupon.code}</span> <span className="shrink-0 text-primary">− {String(coupon.pct).replace('.', ',')}%</span></span>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Remover o cupom" title="Remover o cupom" onClick={clearCoupon}><X className="h-4 w-4" /></Button>
        </div>
        {cart.lines.length > 0 && cart.couponCents === 0 && <p className="text-xs text-muted-foreground">Este cupom não altera os preços do seu carrinho: já há um desconto melhor.</p>}
      </div>
    )
  }
  const submit = async () => {
    setBusy(true); setError(null)
    try { const err = await applyCoupon(code); setError(err); if (!err) setCode('') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-1">
      {/* Sem <form>: o cupom fica dentro do formulário do checkout, e formulário dentro de formulário não vale em HTML. */}
      <div className="flex gap-2">
        <Input aria-label="Código do cupom" autoCapitalize="characters" autoComplete="off" maxLength={30} className="min-w-0 flex-1 uppercase tracking-wider" placeholder="Tenho um cupom"
          value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (code.length >= 3 && !busy) void submit() } }} />
        <Button type="button" variant="outline" disabled={busy || code.length < 3} onClick={() => void submit()}>{busy ? 'Conferindo' : 'Aplicar'}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
