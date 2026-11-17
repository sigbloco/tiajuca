import { KitChip } from '@/modules/shop/KitChip'
import { useMutation } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { formatCurrency } from '@/core/format'
import { WhatsAppIcon } from '@/modules/members/MemberSection'
import { fromCents } from '../catalog'
import { commonPickupIds } from '../cart'
import { METHOD_LABELS, availableMethods, checkoutBlockers, creditFeeCents, creditTotalCents, pickupWhatsAppLinks } from '../payments/pix'
import { attemptId, invokeShop, rememberOrder, type CreatedOrder } from './api'
import { useStore } from './StoreContext'

const money = (cents: number) => formatCurrency(fromCents(cents))

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copiado.`) } catch { toast.error('Não foi possível copiar. Selecione e copie manualmente.') }
}

export function CheckoutPage() {
  const { store, cart, basePath, clear, isMember, index } = useStore()
  const { session } = useAuth()
  const navigate = useNavigate()
  const methods = availableMethods(store.payment_methods)
  const meta = session?.user.user_metadata as { full_name?: string } | undefined
  const [f, setF] = useState({
    name: meta?.full_name ?? '', phone: '', email: session?.user.email ?? '',
    pickup: '', method: methods[0] ?? '',
  })
  const [accepted, setAccepted] = useState(false)
  // Depois de criar o pedido o carrinho esvazia: sem isto a tela cairia no "carrinho vazio" antes de abrir Meus pedidos.
  const finished = useRef(false)
  const blockers = f.method ? checkoutBlockers(f.method as 'pix', store) : ['Esta loja ainda não tem forma de pagamento ativa.']
  const noPickup = store.pickup_points.length === 0
  // Só os pontos que servem a TODOS os itens do carrinho (cada produto pode ter os seus).
  const cartProducts = cart.lines.map((l) => index.get(l.variantId)?.product).filter((p): p is NonNullable<typeof p> => !!p)
  const allowed = commonPickupIds(cartProducts, store.pickup_points.map((p) => p.id))
  const points = store.pickup_points.filter((p) => allowed.includes(p.id))
  const noCommon = !noPickup && points.length === 0
  const pickup = allowed.includes(f.pickup) ? f.pickup : allowed.length === 1 ? allowed[0] : ''

  const submit = useMutation({
    mutationFn: async () => {
      return invokeShop<{ order: CreatedOrder; payment: { url?: string } }>('shop-checkout', {
        org_slug: store.org.slug, client_request_id: attemptId(store.org.slug), name: f.name, phone: f.phone, email: f.email, pickup_point_id: pickup, payment_method: f.method, accept_privacy: accepted,
        items: cart.lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
      })
    },
    onSuccess: ({ order }) => {
      finished.current = true
      rememberOrder(order.code, f.phone)
      attemptId(store.org.slug, true)
      clear()
      // Pix e InfinitePay: o pedido, a chave Pix e o link de pagamento ficam em Meus pedidos (dá para retomar a qualquer momento).
      navigate(`${basePath}/consultar?codigo=${order.code}`, { replace: true })
    },
    onError: (e) => toast.error((e as Error).message), // já vem em português do servidor (invokeShop)
  })

  if (cart.lines.length === 0 && !finished.current) return <Navigate to={`${basePath}/carrinho`} replace />
  const payCents = f.method === 'infinitepay' ? creditTotalCents(cart.totalCents) : cart.totalCents
  const disabled = submit.isPending || !accepted || blockers.length > 0 || noPickup || !f.method || noCommon || !pickup || !f.name.trim() || !f.email.trim() || f.phone.replace(/\D/g, '').length < 10

    const pixBox = f.method === 'pix' && store.pix ? (() => {
      const links = pickupWhatsAppLinks(pickup ? points.filter((p) => p.id === pickup) : points)
      return (
        <div className="space-y-2 border-t border-primary/30 p-3 text-sm">
          <p className="font-semibold">Chave Pix (Em nome de {store.pix.beneficiary})</p>
          <p className="flex flex-wrap items-center gap-2 break-all font-semibold">{store.pix.key}
            <Button type="button" size="sm" variant="outline" onClick={() => void copy(store.pix!.key, 'Chave Pix')}><Copy className="h-4 w-4" /> Copiar</Button></p>
          <p>Depois de confirmar o pedido, pague o valor exato e envie o <strong>comprovante</strong> pelo WhatsApp de um dos pontos de retirada, citando o código do pedido. O pedido só é confirmado quando a loja conferir o pagamento.</p>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((w) => <a key={w.id} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={w.url} target="_blank" rel="noreferrer noopener"><WhatsAppIcon className="h-4 w-4" /> {w.name}</a>)}
            </div>
          )}
        </div>
      )
    })() : null

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <form onSubmit={(e) => { e.preventDefault(); if (!disabled) submit.mutate() }} className="space-y-4">
        <h1>Finalizar compra</h1>
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Seus dados</h2>
          <div className="space-y-1.5"><Label htmlFor="ck-name" required>Nome completo</Label>
            <Input id="ck-name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ck-phone" required>Telefone (WhatsApp)</Label>
            <PhoneInput id="ck-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            <p className="text-sm text-muted-foreground">Se não estiver logado, você vai precisar do telefone e do código do pedido para consultá-lo depois.</p></div>
          <div className="space-y-1.5"><Label htmlFor="ck-email" required>E-mail</Label>
            <Input id="ck-email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Retirada</h2>
          {noPickup
            ? <p className="text-destructive">A loja ainda não tem pontos de retirada disponíveis.</p>
            : noCommon
            ? <p role="alert" className="text-destructive">Os itens do carrinho não têm um ponto de retirada em comum. Faça um pedido para cada grupo de itens.</p>
            : (
              <div className="space-y-1.5"><Label htmlFor="ck-pickup" required>Ponto de retirada</Label>
                <Select id="ck-pickup" required value={pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })}>
                  <option value="" disabled>Escolha</option>
                  {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                {pickup && (() => {
                  const p = store.pickup_points.find((x) => x.id === pickup)
                  if (!p) return null
                  const digits = (p.contact_phone ?? '').replace(/\D/g, '')
                  if (p.kind === 'person' && digits.length >= 10) {
                    return (
                      <a href={`https://wa.me/${digits.startsWith('55') ? digits : '55' + digits}`} target="_blank" rel="noreferrer noopener"
                        className="flex items-start gap-2 text-sm text-primary hover:underline">
                        <WhatsAppIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Clique aqui e combine a entrega direto com {p.contact_name ?? 'o responsável'} ({digits}). Pode ser encontro ao vivo, entrega por aplicativo ou ensaio.</span>
                      </a>
                    )
                  }
                  return <p className="text-sm text-muted-foreground">{p.address}{p.opening_hours ? ` · ${p.opening_hours}` : ''}</p>
                })()}
              </div>
            )}
          <p className="rounded-lg bg-muted p-3 text-sm">A <strong>retirada é combinada</strong>: não há entrega. O dia e o horário são combinados depois que o pedido estiver pronto.</p>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Pagamento</h2>
          <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-2">
            {methods.map((m) => (
              <div key={m} className={cn('rounded-lg border', f.method === m ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
                <button type="button" role="radio" aria-checked={f.method === m} onClick={() => setF({ ...f, method: m })} className="min-h-11 w-full px-3 py-2 text-left">
                  <span className="block font-semibold">{METHOD_LABELS[m].label}</span>
                  <span className="block text-sm text-muted-foreground">{METHOD_LABELS[m].hint}</span>
                  {m === 'infinitepay' && <span className="mt-1 block text-sm font-semibold">Taxa do cartão: {money(creditFeeCents(cart.totalCents))} · você paga ≈ {money(creditTotalCents(cart.totalCents))}. Parcelando, a taxa é maior.</span>}
                  {m === 'pix' && <span className="mt-1 block text-sm font-semibold">Sem taxa · você paga {money(cart.totalCents)}</span>}
                </button>
                {m === 'pix' && pixBox}
              </div>
            ))}
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm">O pagamento é <strong>antecipado e integral</strong>. Os itens ficam reservados por {store.reservation_hours} horas aguardando o pagamento.</p>
          {(f.method === 'infinitepay' || f.method === 'pix') && <p className="rounded-lg bg-muted p-3 text-sm">No pagamento, o recebedor aparece como <strong>MARCELO STEIMBACK DOS SANTOS LIUZZI</strong>. É ele quem recebe pelo Cordão da Tia Juca, pode pagar tranquilo.</p>}
        </Card>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Li e concordo com o <Link className="font-semibold text-primary hover:underline" to={`${basePath}/privacidade`} target="_blank">aviso de privacidade</Link>: usaremos seu nome, telefone e e-mail só para este pedido.</span>
        </label>
        {blockers.map((b) => <p key={b} role="alert" className="text-sm text-destructive">{b}</p>)}
        <Button type="submit" className="w-full" disabled={disabled}>{submit.isPending ? 'Enviando' : `Confirmar pedido · ${f.method === 'infinitepay' ? '≈ ' : ''}${money(payCents)}`}</Button>
      </form>

      <aside className="space-y-2 md:sticky md:top-20 md:self-start">
        <Card className="space-y-2 p-4">
          <h2 className="text-lg font-bold">Resumo</h2>
          <ul className="space-y-1 text-sm">
            {cart.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-2"><span>{l.quantity}× {index.get(l.variantId)?.product.is_kit && <KitChip />}{l.name} ({l.variantLabel})</span><span>{money(l.lineTotalCents)}</span></li>
            ))}
          </ul>
          <hr className="border-border" />
          {cart.discountCents > 0 && <div className="flex justify-between text-sm text-primary"><span>Desconto de integrante</span><span>− {money(cart.discountCents)}</span></div>}
          {f.method === 'infinitepay' && <div className="flex justify-between text-sm"><span>Taxa do cartão (estimada)</span><span>{money(creditFeeCents(cart.totalCents))}</span></div>}
          <div className="flex justify-between text-lg font-extrabold"><span>Total{f.method === 'infinitepay' ? ' no cartão' : ''}</span><span>{f.method === 'infinitepay' ? '≈ ' : ''}{money(payCents)}</span></div>
          {!isMember && <p className="text-xs text-muted-foreground">O valor final é confirmado pelo servidor ao concluir.</p>}
        </Card>
        <Link className="text-sm font-semibold text-primary hover:underline" to={`${basePath}/carrinho`}>← Voltar ao carrinho</Link>
      </aside>
    </div>
  )
}
