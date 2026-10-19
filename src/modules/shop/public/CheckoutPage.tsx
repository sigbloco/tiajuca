import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { formatCurrency } from '@/core/format'
import { fromCents } from '../catalog'
import { getShopConfig } from '../config/shop.config'
import { METHOD_LABELS, availableMethods, checkoutBlockers } from '../payments/pix'
import { invokeShop, saveSnapshot, type CreatedOrder } from './api'
import { useStore } from './StoreContext'

const money = (cents: number) => formatCurrency(fromCents(cents))

export function CheckoutPage() {
  const { store, cart, basePath, clear, isMember } = useStore()
  const { session } = useAuth()
  const navigate = useNavigate()
  const config = getShopConfig()
  const methods = availableMethods(config)
  const meta = session?.user.user_metadata as { full_name?: string } | undefined
  const [f, setF] = useState({
    name: meta?.full_name ?? '', phone: '', email: session?.user.email ?? '',
    pickup: store.pickup_points.length === 1 ? store.pickup_points[0].id : '', method: methods[0] ?? '',
  })
  const blockers = f.method ? checkoutBlockers(config, f.method as 'pix') : []
  const noPickup = store.pickup_points.length === 0

  const submit = useMutation({
    mutationFn: async () => {
      return invokeShop<{ order: CreatedOrder; payment: { url?: string } }>('shop-checkout', {
        org_slug: store.org.slug, name: f.name, phone: f.phone, email: f.email, pickup_point_id: f.pickup, payment_method: f.method,
        items: cart.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      })
    },
    onSuccess: ({ order, payment }) => {
      saveSnapshot({ order, customerName: f.name.trim(), phone: f.phone, paymentUrl: payment?.url })
      clear()
      // InfinitePay: vai direto para a página de pagamento; ao terminar, ela devolve o cliente para esta confirmação.
      if (payment?.url) { window.location.assign(payment.url); return }
      navigate(`${basePath}/pedido/${order.code}`, { replace: true })
    },
    onError: (e) => toast.error((e as Error).message), // já vem em português do servidor (invokeShop)
  })

  if (cart.lines.length === 0) return <Navigate to={`${basePath}/carrinho`} replace />
  const disabled = submit.isPending || blockers.length > 0 || noPickup || !f.method || !f.pickup || !f.name.trim() || !f.email.trim() || f.phone.replace(/\D/g, '').length < 10

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <form onSubmit={(e) => { e.preventDefault(); if (!disabled) submit.mutate() }} className="space-y-4">
        <h1>Finalizar compra</h1>
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Seus dados</h2>
          <div className="space-y-1.5"><Label htmlFor="ck-name">Nome completo</Label>
            <Input id="ck-name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ck-phone">Telefone (WhatsApp)</Label>
            <PhoneInput id="ck-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            <p className="text-sm text-muted-foreground">Você vai precisar do telefone e do código do pedido para consultá-lo depois.</p></div>
          <div className="space-y-1.5"><Label htmlFor="ck-email">E-mail</Label>
            <Input id="ck-email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Retirada</h2>
          {noPickup
            ? <p className="text-destructive">A loja ainda não tem pontos de retirada disponíveis.</p>
            : (
              <div className="space-y-1.5"><Label htmlFor="ck-pickup">Ponto de retirada</Label>
                <Select id="ck-pickup" required value={f.pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })}>
                  <option value="" disabled>Escolha…</option>
                  {store.pickup_points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                {f.pickup && (() => { const p = store.pickup_points.find((x) => x.id === f.pickup); return p && (
                  <p className="text-sm text-muted-foreground">{p.address}{p.opening_hours ? ` · ${p.opening_hours}` : ''}</p>) })()}
              </div>
            )}
          <p className="rounded-lg bg-muted p-3 text-sm">A <strong>retirada é combinada</strong>: não há entrega. O dia e o horário são combinados depois que o pedido estiver pronto.</p>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Pagamento</h2>
          <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-2">
            {methods.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={f.method === m} onClick={() => setF({ ...f, method: m })}
                className={cn('min-h-11 rounded-lg border px-3 py-2 text-left', f.method === m ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
                <span className="block font-semibold">{METHOD_LABELS[m].label}</span>
                <span className="block text-sm text-muted-foreground">{METHOD_LABELS[m].hint}</span>
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm">O pagamento é <strong>antecipado e integral</strong>. Os itens ficam reservados por {config.reservationHours} horas aguardando o pagamento.</p>
        </Card>

        {blockers.map((b) => <p key={b} role="alert" className="text-sm text-destructive">{b}</p>)}
        <Button type="submit" className="w-full" disabled={disabled}>{submit.isPending ? 'Enviando…' : `Confirmar pedido · ${money(cart.totalCents)}`}</Button>
      </form>

      <aside className="space-y-2 md:sticky md:top-20 md:self-start">
        <Card className="space-y-2 p-4">
          <h2 className="text-lg font-bold">Resumo</h2>
          <ul className="space-y-1 text-sm">
            {cart.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-2"><span>{l.quantity}× {l.name} ({l.variantLabel})</span><span>{money(l.lineTotalCents)}</span></li>
            ))}
          </ul>
          <hr className="border-border" />
          {cart.discountCents > 0 && <div className="flex justify-between text-sm text-primary"><span>Desconto de integrante</span><span>− {money(cart.discountCents)}</span></div>}
          <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{money(cart.totalCents)}</span></div>
          {!isMember && <p className="text-xs text-muted-foreground">O valor final é confirmado pelo servidor ao concluir.</p>}
        </Card>
        <Link className="text-sm font-semibold text-primary hover:underline" to={`${basePath}/carrinho`}>← Voltar ao carrinho</Link>
      </aside>
    </div>
  )
}
