import { useMutation, useQuery } from '@tanstack/react-query'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { ChevronDown, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { formatCurrency, formatDate, formatDateTime } from '@/core/format'
import { fromCents, type ProductKind } from '../catalog'
import { CUSTOMER_STATUS_LABEL, progressIndex, progressSteps, type TimelineEntry } from '../orders/customerView'
import type { FulfillmentStatus, OrderStatus } from '../orders/transitions'
import { WhatsAppIcon } from '@/modules/members/MemberSection'
import { CreditFeeTable } from './CreditFeeTable'
import { PixQr } from './PixQr'
import { availableMethods, CREDIT_FEES_PCT, creditFeeCents, creditTotalCents, formatPct, directorLinks, pickupWhatsAppLinks, pixInstructions } from '../payments/pix'
import { invokeShop } from './api'
import { useStore } from './StoreContext'

const money = (c: number) => formatCurrency(fromCents(c))
const KEY = 'shop:lookup'

interface LookupResult {
  order: {
    code: string; status: OrderStatus; payment_method: 'pix' | 'infinitepay'; customer_name: string; pickup_point_id?: string
    subtotal_cents: number; discount_cents: number; total_cents: number; created_at: string; expires_at: string | null; paid_at: string | null
    payment_url: string | null; cancel_reason: string | null
  }
  items: { name: string; variant: string; quantity: number; unit_final_cents: number; kind: ProductKind }[]
  fulfillments: { kind: ProductKind; status: FulfillmentStatus }[]
  pickup: { name: string; address: string; opening_hours: string }
  timeline: TimelineEntry[]
}

const KIND_NAME: Record<ProductKind, string> = { stock: 'Pronta entrega', made_to_order: 'Sob encomenda' }

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copiado.`) } catch { toast.error('Não foi possível copiar.') }
}

function Progress({ kind, status }: { kind: ProductKind; status: FulfillmentStatus }) {
  const steps = progressSteps(kind)
  const at = progressIndex(kind, status)
  if (status === 'cancelled') return <p className="text-sm text-muted-foreground">Cancelado</p>
  return (
    <ol className="flex gap-1" aria-label={`Andamento ${KIND_NAME[kind]}`}>
      {steps.map((s, i) => (
        <li key={s.key} className="flex-1 text-center" aria-current={i === at ? 'step' : undefined}>
          <div className={cn('h-2 rounded-full', i <= at ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('mt-1 block text-xs leading-tight', i === at ? 'font-bold' : 'text-muted-foreground')}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

const METHOD_NAME = { pix: 'Pix', infinitepay: 'Cartão de crédito (InfinitePay)' } as const
const METHOD_SHORT = { pix: 'Pix', infinitepay: 'Cartão de crédito' } as const
const linkBtn = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold hover:bg-muted'

function OrderView({ data, phone, onRefresh, defaultOpen = false, open: openProp, onToggle }: { data: LookupResult; phone: string; onRefresh: () => void; refreshing?: boolean; defaultOpen?: boolean; open?: boolean; onToggle?: () => void }) {
  const { store } = useStore()
  const { order } = data
  const [status, setStatus] = useState(order.status)
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const open = openProp ?? localOpen
  const toggle = onToggle ?? (() => setLocalOpen(!localOpen))
  const [confirmCancel, setConfirmCancel] = useState(false)
  useEffect(() => setStatus(order.status), [order.status])
  const report = useMutation({
    mutationFn: () => invokeShop<{ status: OrderStatus }>('shop-order-public', { action: 'report_payment', org_slug: store.org.slug, code: order.code, phone }),
    onSuccess: (r) => { setStatus(r.status); toast.success('Avisamos a loja. Vamos conferir o seu pagamento.'); onRefresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const pix = order.payment_method === 'pix' && status === 'awaiting_payment' && store.pix
    ? pixInstructions({ pix: store.pix, contact: store.contact, orderCode: order.code, totalCents: order.total_cents, customerName: order.customer_name })
    : null
  const directors = directorLinks(store.contact, order.code)
  const cancel = useMutation({
    mutationFn: () => invokeShop<{ status: OrderStatus }>('shop-order-public', { action: 'cancel', org_slug: store.org.slug, code: order.code, phone }),
    onSuccess: () => { setConfirmCancel(false); toast.success('Pedido cancelado.'); onRefresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const change = useMutation({
    mutationFn: (m: string) => invokeShop('shop-checkout', { action: 'change_method', org_slug: store.org.slug, code: order.code, phone, payment_method: m }),
    onSuccess: () => { toast.success('Forma de pagamento alterada.'); onRefresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const others = status === 'awaiting_payment' ? availableMethods(store.payment_methods).filter((m) => m !== order.payment_method && (m !== 'pix' || !!store.pix)) : []
  const pickupZap = (() => {
    const pp = store.pickup_points.find((p) => p.id === order.pickup_point_id)
    const d = (pp?.contact_phone ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null
  })()
  // Cartão de crédito: a taxa da InfinitePay entra no valor a pagar (à vista) enquanto o pedido espera pagamento.
  const withFee = order.payment_method === 'infinitepay' && status === 'awaiting_payment'
  const feeCents = withFee ? creditFeeCents(order.total_cents) : 0
  const payCents = order.total_cents + feeCents
  const payUrl = order.payment_method === 'infinitepay' && status === 'awaiting_payment' ? order.payment_url : null
  const itemCount = data.items.reduce((n, i) => n + i.quantity, 0)
  const pickupLinks = pickupWhatsAppLinks(store.pickup_points.filter((p) => p.id === order.pickup_point_id), { orderCode: order.code, totalCents: order.total_cents, customerName: order.customer_name, firstId: order.pickup_point_id })

  return (
    <Card className="overflow-hidden p-0">
      <div role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle() } }}
        className="flex w-full cursor-pointer items-start gap-3 bg-card p-4 text-left hover:bg-muted">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-extrabold tracking-widest">{order.code}</span>
            <button type="button" aria-label="Copiar código do pedido" title="Copiar código do pedido" onClick={(e) => { e.stopPropagation(); void copy(order.code, 'Código') }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-background"><Copy className="h-4 w-4" /></button>
            <Badge>{CUSTOMER_STATUS_LABEL[status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{formatDateTime(order.created_at)}</p>
          <p className="text-sm text-muted-foreground">{itemCount} {itemCount === 1 ? 'item' : 'itens'}{order.expires_at && status === 'awaiting_payment' ? ` (reservado até ${formatDate(order.expires_at)})` : ''}</p>
          <p className="text-sm text-muted-foreground">{METHOD_NAME[order.payment_method]}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-lg font-extrabold">{money(payCents)}</span>
        <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </div>
      {payUrl && <div className="px-4 pb-4"><a className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-bold text-primary-foreground hover:opacity-90" href={payUrl}>Ir para o pagamento · <span className="whitespace-nowrap">{money(payCents)}</span></a></div>}
      {open && <div className="divide-y divide-border border-t border-border">
      <section className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Itens</h2>
        <ul className="space-y-1 text-sm">
          {data.items.map((i) => <li key={`${i.name}-${i.variant}`} className="flex justify-between gap-3"><span className="min-w-0">{i.quantity}× {i.name} ({i.variant}){i.kind === 'made_to_order' ? ' · sob encomenda' : ''}</span><span className="shrink-0 whitespace-nowrap">{money(i.unit_final_cents * i.quantity)}</span></li>)}
        </ul>
        {order.discount_cents > 0 && <div className="flex justify-between gap-3 text-sm text-primary"><span className="min-w-0">Desconto de integrante</span><span className="shrink-0 whitespace-nowrap">− {money(order.discount_cents)}</span></div>}
        {withFee && <div className="flex justify-between gap-3 text-sm"><span className="min-w-0">Taxa do cartão de crédito à vista ({formatPct(CREDIT_FEES_PCT[0])})</span><span className="shrink-0 whitespace-nowrap">+ {money(feeCents)}</span></div>}
        <div className="flex justify-between gap-3 text-lg font-extrabold"><span>Total</span><span className="shrink-0 whitespace-nowrap">{money(payCents)}</span></div>
        {status === 'cancelled' && order.cancel_reason && <p className="text-sm text-muted-foreground">Motivo: {order.cancel_reason}</p>}
        {status === 'paid' && data.fulfillments.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="font-bold">Andamento</h3>
            {data.fulfillments.map((f) => (
              <div key={f.kind} className="space-y-1.5">
                <p className="text-sm font-semibold">{KIND_NAME[f.kind]}</p>
                <Progress kind={f.kind} status={f.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {status !== 'cancelled' && (
        <section className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Forma de pagamento:<br />{METHOD_NAME[order.payment_method]}</h2>
          {status === 'paid' && <p className="text-sm">Pagamento confirmado. Obrigado!</p>}
          {status === 'payment_review' && <p className="text-sm">Recebemos o seu aviso. Assim que a loja conferir o comprovante, o pedido é marcado como pago.</p>}
          {order.payment_method === 'infinitepay' && status === 'awaiting_payment' && (
            <>
              {!order.payment_url && <p className="text-sm text-muted-foreground">O link de pagamento não está disponível. Fale com a direção abaixo ou troque a forma de pagamento.</p>}
              <CreditFeeTable cents={order.total_cents} />
            </>
          )}
          {pix && (
            <>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Valor exato</dt><dd className="text-xl font-extrabold">{pix.amountText}</dd></div>
                <div><dt className="text-muted-foreground">Chave Pix (Em nome de {pix.beneficiary})</dt>
                  <dd className="flex flex-wrap items-center gap-2 break-all font-semibold">{pix.key}
                    <Button size="sm" variant="outline" onClick={() => copy(pix.key, 'Chave Pix')}><Copy className="h-4 w-4" /> Copiar</Button></dd></div>
                <div><dt className="text-muted-foreground">Referência</dt><dd className="font-bold tracking-widest">{pix.reference}</dd></div>
              </dl>
              <p className="rounded-lg bg-muted p-3 text-sm">Depois de pagar, envie o <strong>comprovante</strong> pelo WhatsApp (ou por e-mail) com o código <strong>{order.code}</strong>. O pedido só é confirmado quando a loja conferir o pagamento.</p>
              <PixQr pixKey={pix.key} beneficiary={pix.beneficiary} amountCents={order.total_cents} orderCode={order.code} />
              <div className="flex flex-wrap gap-2">
                {pickupLinks.map((w) => <a key={w.id} className={linkBtn} href={w.url} target="_blank" rel="noreferrer noopener"><WhatsAppIcon className="h-4 w-4" /> {w.name}</a>)}
                {pickupLinks.length === 0 && pix.whatsappUrl && <a className={linkBtn} href={pix.whatsappUrl} target="_blank" rel="noreferrer noopener"><WhatsAppIcon className="h-4 w-4" /> Enviar comprovante pelo WhatsApp</a>}
                {pix.mailtoUrl && <a className={linkBtn} href={pix.mailtoUrl}>Enviar por e-mail</a>}
              </div>
              <Button className="w-full" disabled={report.isPending} onClick={() => report.mutate()}>{report.isPending ? 'Enviando' : 'Já fiz o pagamento'}</Button>
            </>
          )}
          {others.map((m) => <Button key={m} variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-2 text-center" disabled={change.isPending} onClick={() => change.mutate(m)}>Trocar forma de pagamento para {METHOD_SHORT[m]}{' '}<span className="whitespace-nowrap">({m === 'infinitepay' ? `${money(creditTotalCents(order.total_cents))} à vista` : `${money(order.total_cents)}, sem taxa`})</span></Button>)}
        </section>
      )}

      <section className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Retirada</h2>
        <p className="font-semibold">{data.pickup.name}{data.pickup.address ? <span className="font-normal"> - {data.pickup.address}</span> : null}</p>
        {data.pickup.opening_hours && <p className="text-sm text-muted-foreground">{data.pickup.opening_hours}</p>}
        <p className="text-sm">A retirada é combinada: avisaremos quando estiver pronta.</p>
        {pickupZap && <a className={linkBtn} href={pickupZap} target="_blank" rel="noreferrer noopener"><WhatsAppIcon className="h-4 w-4" /> Falar pelo WhatsApp</a>}
      </section>

      {directors.length > 0 && (
        <section className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Precisa de ajuda?</h2>
          <ButtonRow>
            {directors.map((d) => <a key={d.name} className={`${linkBtn} justify-center`} href={d.url} target="_blank" rel="noreferrer noopener"><WhatsAppIcon className="h-4 w-4 shrink-0" /> {d.name}</a>)}
          </ButtonRow>
        </section>
      )}
      {status === 'awaiting_payment' && (
        <section className="space-y-3 p-5">
            {status === 'awaiting_payment' && (confirmCancel
              ? (
                <div className="space-y-2 rounded-lg border border-destructive p-3">
                  <p className="text-sm font-semibold">Cancelar este pedido? Os itens reservados serão liberados.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setConfirmCancel(false)}>Voltar</Button>
                    <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelando' : 'Sim, cancelar'}</Button>
                  </div>
                </div>
              )
              : <Button variant="outline" className="w-full text-destructive" onClick={() => setConfirmCancel(true)}>Cancelar pedido</Button>)}
  
        </section>
      )}
      </div>}
    </Card>
  )
}

const PAGE = 5

/** Logado: lista dos próprios pedidos, sem pedir código nem telefone. */
function MyOrders({ highlight }: { highlight: string }) {
  const { store } = useStore()
  const { session } = useAuth()
  const [shown, setShown] = useState(PAGE)
  const [openCode, setOpenCode] = useState<string | null>(highlight || null)
  const q = useQuery({
    queryKey: ['shop', 'my-orders', store.org.slug, session?.user.id],
    queryFn: async () => (await invokeShop<{ orders: LookupResult[] }>('shop-order-public', { action: 'mine', org_slug: store.org.slug })).orders,
    refetchInterval: (query) => (query.state.data?.some((o) => o.order.status === 'awaiting_payment' || o.order.status === 'payment_review') ? 20_000 : false),
  })
  if (q.isPending) return <p className="text-center text-muted-foreground">Carregando seus pedidos</p>
  if (q.isError) return <Card className="space-y-2 p-5"><p role="alert" className="text-destructive">{(q.error as Error).message}</p><Button onClick={() => void q.refetch()}>Tentar de novo</Button></Card>
  const orders = [...q.data].sort((a, b) => Number(b.order.code === highlight) - Number(a.order.code === highlight))
  if (orders.length === 0) return <Card className="p-5"><p>Você ainda não fez pedidos nesta loja.</p></Card>
  return (
    <div className="space-y-4">
      {orders.slice(0, shown).map((o) => <OrderView key={o.order.code} data={o} open={openCode === o.order.code} onToggle={() => setOpenCode(openCode === o.order.code ? null : o.order.code)} phone="" onRefresh={() => void q.refetch()} refreshing={q.isFetching} />)}
      {orders.length > shown && <Button variant="outline" className="w-full" onClick={() => setShown(shown + PAGE)}>Ver mais {Math.min(PAGE, orders.length - shown)}</Button>}
    </div>
  )
}

/** "Meus pedidos": logado vê os próprios pedidos; visitante consulta pelo código do pedido + telefone da compra. */
export function OrderLookupPage() {
  const { basePath, store } = useStore()
  const { session } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const fromState = location.state as { code?: string; phone?: string } | null
  const saved = useRef<{ code: string; phone: string } | null>(null)
  if (saved.current === null) {
    try { saved.current = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { saved.current = null }
  }
  const urlCode = (params.get('codigo') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const [code, setCode] = useState(fromState?.code ?? (urlCode || saved.current?.code || ''))
  const [phone, setPhone] = useState(fromState?.phone ?? (saved.current && (!urlCode || saved.current.code === urlCode) ? saved.current.phone : ''))
  const [data, setData] = useState<LookupResult | null>(null)

  const search = useMutation({
    mutationFn: () => invokeShop<LookupResult>('shop-order-public', { action: 'lookup', org_slug: store.org.slug, code: code.trim().toUpperCase(), phone }),
    onSuccess: (r) => {
      setData(r)
      try { sessionStorage.setItem(KEY, JSON.stringify({ code: code.trim().toUpperCase(), phone })) } catch { /* sem armazenamento: só não lembra */ }
    },
    onError: (e) => { setData(null); toast.error((e as Error).message) },
  })

  // Veio da compra (ou recarregou/voltou do pagamento): consulta sozinho e acompanha o pagamento até ser confirmado.
  const auto = useRef(false)
  useEffect(() => {
    if (!session && !auto.current && code && phone.replace(/\D/g, '').length >= 10) { auto.current = true; search.mutate() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const waiting = data?.order.status === 'awaiting_payment' || data?.order.status === 'payment_review'
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => search.mutate(), 20_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting])

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1>Meus pedidos</h1>
      {session ? <MyOrders highlight={code.trim().toUpperCase()} /> : (
        <>
          <Card className="p-5">
            <form onSubmit={(e) => { e.preventDefault(); if (code.trim() && phone) search.mutate() }} className="space-y-3">
              <p className="text-sm text-muted-foreground">Informe o código do pedido (está no e-mail e na tela de confirmação) e o telefone usado na compra. Ou entre na sua conta para ver todos os seus pedidos.</p>
              <div className="space-y-1.5"><Label htmlFor="lk-code">Código do pedido</Label>
                <Input id="lk-code" autoCapitalize="characters" autoComplete="off" maxLength={12} className="uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
              <div className="space-y-1.5"><Label htmlFor="lk-phone">Telefone</Label><PhoneInput id="lk-phone" value={phone} onChange={setPhone} /></div>
              <Button type="submit" className="w-full" disabled={search.isPending || code.trim().length < 6 || phone.replace(/\D/g, '').length < 10}>{search.isPending ? 'Buscando' : 'Consultar pedido'}</Button>
            </form>
          </Card>
          {data && <OrderView key={data.order.code} defaultOpen data={data} phone={phone} onRefresh={() => search.mutate()} refreshing={search.isPending} />}
        </>
      )}
      <Link className="block text-center font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link>
    </div>
  )
}

/** Links antigos (/pedido/CÓDIGO, inclusive o retorno da InfinitePay) levam para "Meus pedidos" com o código. */
export function OrderCodeRedirect() {
  const { code = '' } = useParams()
  const { basePath } = useStore()
  return <Navigate to={`${basePath}/consultar?codigo=${encodeURIComponent(code)}`} replace />
}
