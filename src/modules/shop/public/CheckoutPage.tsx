import { KitChip } from '@/modules/shop/KitChip'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PhoneInput, maskPhone } from '@/components/ui/masked-inputs'
import { supabase } from '@/core/supabase'
import { Button, Card, Input, Label, Select, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { formatCents } from '@/core/format'
import { whatsappUrl } from '@/core/whatsapp'
import { WhatsAppIcon } from '@/modules/members/MemberSection'
import { commonPickupIds } from '../cart'
import { METHOD_LABELS, availableMethods, checkoutBlockers, creditFeeCents, creditFees, creditTotalCents, formatPct } from '../payments/pix'
import { CouponBox } from './CouponBox'
import { GoogleInvite } from './GoogleInvite'
import { attemptId, invokeShop, rememberOrder, type CreatedOrder } from './api'
import { useStore } from './StoreContext'


export function CheckoutPage() {
  const { store, cart, basePath, clear, isMember, index, coupon, clearCoupon } = useStore()
  const { session } = useAuth()
  const navigate = useNavigate()
  const methods = availableMethods(store.payment_methods)
  const fees = creditFees(store.credit_fees_pct)
  const meta = session?.user.user_metadata as { full_name?: string } | undefined
  const [f, setF] = useState({
    name: meta?.full_name ?? '', phone: '', email: session?.user.email ?? '',
    pickup: '', method: methods[0] ?? '',
  })
  const [accepted, setAccepted] = useState(false)
  // Depois de criar o pedido o carrinho esvazia: sem isto a tela cairia no "carrinho vazio" antes de abrir Meus pedidos.
  const finished = useRef(false)
  const [bad, setBad] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const badCls = 'rounded-lg border border-destructive bg-destructive/10 p-2'
  // Logado: nome, e-mail e WhatsApp vêm do cadastro (ou do último pedido); sobra só escolher o ponto de retirada.
  const contact = useQuery({
    queryKey: ['shop', 'my-contact', store.org.id, session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('shop_my_contact', { p_org: store.org.id })
      if (error) throw error
      return data as { name: string | null; email: string | null; phone: string | null } | null
    },
  })
  useEffect(() => {
    const c = contact.data
    if (!c) return
    setF((prev) => ({
      ...prev,
      name: prev.name.trim() ? prev.name : c.name ?? prev.name,
      email: prev.email.trim() ? prev.email : c.email ?? prev.email,
      phone: prev.phone.replace(/\D/g, '').length >= 10 ? prev.phone : c.phone ? maskPhone(c.phone) : prev.phone,
    }))
  }, [contact.data])
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
        coupon: coupon?.code,
      })
    },
    onSuccess: ({ order }) => {
      finished.current = true
      rememberOrder(order.code, f.phone)
      attemptId(store.org.slug, true)
      clear()
      clearCoupon()
      // Pix e InfinitePay: o pedido, a chave Pix e o link de pagamento ficam em Meus pedidos (dá para retomar a qualquer momento).
      navigate(`${basePath}/consultar?codigo=${order.code}`, { replace: true })
    },
    onError: (e) => toast.error((e as Error).message), // já vem em português do servidor (invokeShop)
  })

  if (cart.lines.length === 0 && !finished.current) return <Navigate to={`${basePath}/carrinho`} replace />
  const payCents = f.method === 'infinitepay' ? creditTotalCents(cart.totalCents, 1, fees) : cart.totalCents
  const dataOk = !!f.name.trim() && !!f.email.trim() && f.phone.replace(/\D/g, '').length >= 10
  const compactData = !!session && dataOk && !editing
  // O botão está sempre clicável: se faltar algo, rola até o campo e o pinta de vermelho.
  const tryConfirm = () => {
    if (submit.isPending) return
    const block = blockers[0] ?? (noPickup ? 'A loja ainda não tem pontos de retirada disponíveis.' : noCommon ? 'Os itens do carrinho não têm um ponto de retirada em comum.' : !f.method ? 'Escolha a forma de pagamento.' : '')
    if (block) { toast.error(block); return }
    const missing: [string, string][] = []
    if (!f.name.trim()) missing.push(['ck-name', 'Nome completo'])
    if (f.phone.replace(/\D/g, '').length < 10) missing.push(['ck-phone', 'Telefone (WhatsApp)'])
    if (!f.email.trim()) missing.push(['ck-email', 'E-mail'])
    if (!pickup) missing.push(['ck-pickup', 'Ponto de retirada'])
    if (!accepted) missing.push(['ck-accept', 'Aceite do aviso de privacidade'])
    setBad(missing.map((m) => m[0]))
    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.map((m) => m[1]).join(', ')}.`)
      if (compactData && missing.some((m) => ['ck-name', 'ck-phone', 'ck-email'].includes(m[0]))) setEditing(true)
      setTimeout(() => {
        const el = document.getElementById(`f-${missing[0][0]}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        document.getElementById(missing[0][0])?.focus({ preventScroll: true })
      }, 50)
      return
    }
    submit.mutate()
  }


  const summary = (
      <Card className="space-y-2 p-4">
        <h2 className="text-lg font-bold">Resumo</h2>
        <ul className="space-y-1 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-2"><span>{l.quantity}× {index.get(l.variantId)?.product.is_kit && <KitChip />}{l.name} ({l.variantLabel})</span><span className="shrink-0 whitespace-nowrap">{formatCents(l.lineTotalCents)}</span></li>
          ))}
        </ul>
        <hr className="border-border" />
        <CouponBox />
        {cart.discountCents - cart.couponCents > 0 && <div className="flex justify-between text-sm text-primary"><span>Desconto de integrante</span><span className="shrink-0 whitespace-nowrap">− {formatCents(cart.discountCents - cart.couponCents)}</span></div>}
        {cart.couponCents > 0 && coupon && <div className="flex justify-between text-sm text-primary"><span>Cupom {coupon.code}</span><span className="shrink-0 whitespace-nowrap">− {formatCents(cart.couponCents)}</span></div>}
        {f.method === 'infinitepay' && <div className="flex justify-between text-sm"><span>Taxa do cartão à vista ({formatPct(fees[0])})</span><span className="shrink-0 whitespace-nowrap">+ {formatCents(creditFeeCents(cart.totalCents, 1, fees))}</span></div>}
        <div className="flex justify-between text-lg font-extrabold"><span>Total{f.method === 'infinitepay' ? ' no cartão' : ''}</span><span className="shrink-0 whitespace-nowrap">{f.method === 'infinitepay' ? '≈ ' : ''}{formatCents(payCents)}</span></div>
        {!isMember && <p className="text-xs text-muted-foreground">O valor final é confirmado pelo servidor ao concluir.</p>}
      </Card>
  )

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <form onSubmit={(e) => { e.preventDefault(); tryConfirm() }} noValidate className="space-y-4">
        <h1>Finalizar compra</h1>
        <GoogleInvite title="Entre com o Google" text="Preenchemos seus dados e você acompanha seus pedidos sem precisar de código (usamos só o nome e o e-mail da sua conta). Comprar como visitante também funciona." />
        {compactData ? (
          <Card className="space-y-1 p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">Seus dados</h2>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Alterar</Button>
            </div>
            <p className="font-semibold">{f.name}</p>
            <p className="text-sm">{f.phone} (WhatsApp) · {f.email}</p>
          </Card>
        ) : (
          <Card className="space-y-3 p-4">
            <h2 className="text-lg font-bold">Seus dados</h2>
            <div id="f-ck-name" className={cn('space-y-1.5', bad.includes('ck-name') && badCls)}><Label htmlFor="ck-name" required>Nome completo</Label>
              <Input id="ck-name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div id="f-ck-phone" className={cn('space-y-1.5', bad.includes('ck-phone') && badCls)}><Label htmlFor="ck-phone" required>Telefone (WhatsApp)</Label>
              <PhoneInput id="ck-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
              <p className="text-sm text-muted-foreground">Se não estiver logado, você vai precisar do telefone e do código do pedido para consultá-lo depois.</p></div>
            <div id="f-ck-email" className={cn('space-y-1.5', bad.includes('ck-email') && badCls)}><Label htmlFor="ck-email" required>E-mail</Label>
              <Input id="ck-email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </Card>
        )}

        <div className="md:hidden">{summary}</div>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Pagamento</h2>
          <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-2">
            {methods.map((m) => (
              <div key={m} className={cn('rounded-lg border', f.method === m ? 'border-primary bg-primary/10' : 'border-border bg-card')}>
                <button type="button" role="radio" aria-checked={f.method === m} onClick={() => setF({ ...f, method: m })} className="min-h-11 w-full px-3 py-2 text-left">
                  <span className="block font-semibold">{METHOD_LABELS[m].label} · <span className="whitespace-nowrap">{m === 'infinitepay' ? '≈ ' : ''}{formatCents(m === 'infinitepay' ? creditTotalCents(cart.totalCents, 1, fees) : cart.totalCents)}</span></span>
                </button>
              </div>
            ))}
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm">O pagamento é <strong>antecipado e integral</strong>. Os itens ficam reservados por {store.reservation_hours} horas aguardando o pagamento.{store.pix?.beneficiary && <> No pagamento, o recebedor aparece como <strong>{store.pix.beneficiary}</strong>, que recebe pelo {store.org.name}: pode pagar tranquilo.</>}</p>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-bold">Retirada</h2>
          {noPickup
            ? <p className="text-destructive">A loja ainda não tem pontos de retirada disponíveis.</p>
            : noCommon
            ? <p role="alert" className="text-destructive">Os itens do carrinho não têm um ponto de retirada em comum. Faça um pedido para cada grupo de itens.</p>
            : (
              <div id="f-ck-pickup" className={cn('space-y-1.5', bad.includes('ck-pickup') && badCls)}><Label htmlFor="ck-pickup" required>Ponto de retirada</Label>
                <Select id="ck-pickup" value={pickup} onChange={(e) => setF({ ...f, pickup: e.target.value })}>
                  <option value="" disabled>Escolha</option>
                  {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                {pickup && (() => {
                  const p = store.pickup_points.find((x) => x.id === pickup)
                  if (!p) return null
                  const digits = (p.contact_phone ?? '').replace(/\D/g, '')
                  const zap = p.kind === 'person' ? whatsappUrl(p.contact_phone) : null
                  if (zap) {
                    return (
                      <a href={zap} target="_blank" rel="noreferrer noopener"
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

        <label id="f-ck-accept" className={cn('flex items-start gap-3 text-sm', bad.includes('ck-accept') && badCls)}>
          <input id="ck-accept" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>Li e concordo com o <Link className="font-semibold text-primary hover:underline" to={`${basePath}/privacidade`} target="_blank">aviso de privacidade</Link>: usaremos seu nome, telefone e e-mail só para este pedido.</span>
        </label>
        {blockers.map((b) => <p key={b} role="alert" className="text-sm text-destructive">{b}</p>)}
        <Button type="submit" className="w-full" disabled={submit.isPending}>{submit.isPending ? 'Enviando' : `Avançar para o pagamento · ${f.method === 'infinitepay' ? '≈ ' : ''}${formatCents(payCents)}`}</Button>
      </form>

      <aside className="hidden space-y-2 md:sticky md:top-20 md:block md:self-start">
        {summary}
        <Link className="text-sm font-semibold text-primary hover:underline" to={`${basePath}/carrinho`}>← Voltar ao carrinho</Link>
      </aside>
    </div>
  )
}
