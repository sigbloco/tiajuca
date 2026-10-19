import { useMutation } from '@tanstack/react-query'
import { Copy, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, cn } from '@/components/ui/primitives'
import { formatCurrency, formatDateTime } from '@/core/format'
import { fromCents, type ProductKind } from '../catalog'
import { CUSTOMER_STATUS_LABEL, nextStepText, progressIndex, progressSteps, timelineLabel, type TimelineEntry } from '../orders/customerView'
import type { FulfillmentStatus, OrderStatus } from '../orders/transitions'
import { directorLinks, pixInstructions } from '../payments/pix'
import { invokeShop } from './api'
import { useStore } from './StoreContext'

const money = (c: number) => formatCurrency(fromCents(c))
const KEY = 'shop:lookup'

interface LookupResult {
  order: {
    code: string; status: OrderStatus; payment_method: 'pix' | 'infinitepay'; customer_name: string
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

function OrderView({ data, phone, onRefresh, refreshing }: { data: LookupResult; phone: string; onRefresh: () => void; refreshing: boolean }) {
  const { store } = useStore()
  const { order } = data
  const [status, setStatus] = useState(order.status)
  useEffect(() => setStatus(order.status), [order.status])
  const report = useMutation({
    mutationFn: () => invokeShop<{ status: OrderStatus }>('shop-order-public', { action: 'report_payment', code: order.code, phone }),
    onSuccess: (r) => { setStatus(r.status); toast.success('Avisamos a loja. Vamos conferir o seu pagamento.'); onRefresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const pix = order.payment_method === 'pix' && status === 'awaiting_payment' && store.pix
    ? pixInstructions({ pix: store.pix, contact: store.contact, orderCode: order.code, totalCents: order.total_cents, customerName: order.customer_name })
    : null
  const directors = directorLinks(store.contact, order.code)

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-2xl font-extrabold tracking-widest">{order.code}</p>
          <Badge>{CUSTOMER_STATUS_LABEL[status]}</Badge>
        </div>
        <p className="text-sm">{nextStepText(status, order.payment_method)}</p>
        {status === 'cancelled' && order.cancel_reason && <p className="text-sm text-muted-foreground">Motivo: {order.cancel_reason}</p>}
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </Card>

      {status === 'paid' && data.fulfillments.length > 0 && (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Andamento</h2>
          {data.fulfillments.map((f) => (
            <div key={f.kind} className="space-y-1.5">
              <p className="text-sm font-semibold">{KIND_NAME[f.kind]}</p>
              <Progress kind={f.kind} status={f.status} />
            </div>
          ))}
        </Card>
      )}

      {pix && (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Pague com Pix</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Valor exato</dt><dd className="text-xl font-extrabold">{pix.amountText}</dd></div>
            <div><dt className="text-muted-foreground">Chave Pix ({pix.beneficiary})</dt>
              <dd className="flex flex-wrap items-center gap-2 break-all font-semibold">{pix.key}
                <Button size="sm" variant="outline" onClick={() => copy(pix.key, 'Chave Pix')}><Copy className="h-4 w-4" /> Copiar</Button></dd></div>
            <div><dt className="text-muted-foreground">Referência</dt><dd className="font-bold tracking-widest">{pix.reference}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {pix.whatsappUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={pix.whatsappUrl} target="_blank" rel="noreferrer noopener">Enviar comprovante pelo WhatsApp</a>}
            {pix.mailtoUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={pix.mailtoUrl}>Enviar por e-mail</a>}
          </div>
          <Button className="w-full" disabled={report.isPending} onClick={() => report.mutate()}>{report.isPending ? 'Enviando…' : 'Já fiz o pagamento'}</Button>
          {order.expires_at && <p className="text-sm text-muted-foreground">Itens reservados até {formatDateTime(order.expires_at)}.</p>}
        </Card>
      )}
      {order.payment_method === 'infinitepay' && status === 'awaiting_payment' && order.payment_url && (
        <Card className="space-y-2 p-5">
          <a className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-bold text-primary-foreground hover:opacity-90" href={order.payment_url}>Ir para o pagamento · {money(order.total_cents)}</a>
          {order.expires_at && <p className="text-sm text-muted-foreground">Itens reservados até {formatDateTime(order.expires_at)}.</p>}
        </Card>
      )}

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-bold">Retirada</h2>
        <p className="font-semibold">{data.pickup.name}</p>
        <p className="text-sm">{data.pickup.address}</p>
        {data.pickup.opening_hours && <p className="text-sm text-muted-foreground">{data.pickup.opening_hours}</p>}
        <p className="text-sm">A retirada é combinada: avisaremos quando estiver pronta.</p>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-bold">Itens</h2>
        <ul className="space-y-1 text-sm">
          {data.items.map((i) => <li key={`${i.name}-${i.variant}`} className="flex justify-between gap-2"><span>{i.quantity}× {i.name} ({i.variant}){i.kind === 'made_to_order' ? ' · sob encomenda' : ''}</span><span>{money(i.unit_final_cents * i.quantity)}</span></li>)}
        </ul>
        {order.discount_cents > 0 && <div className="flex justify-between text-sm text-primary"><span>Desconto de integrante</span><span>− {money(order.discount_cents)}</span></div>}
        <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{money(order.total_cents)}</span></div>
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-bold">Histórico</h2>
        <ul className="space-y-1 text-sm">
          {data.timeline.map((e, i) => <li key={i} className="text-muted-foreground"><span className="text-foreground">{timelineLabel(e)}</span> · {formatDateTime(e.at)}</li>)}
        </ul>
      </Card>

      {directors.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="text-lg font-bold">Precisa de ajuda?</h2>
          <div className="flex flex-wrap gap-2">
            {directors.map((d) => <a key={d.name} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={d.url} target="_blank" rel="noreferrer noopener">{d.name}</a>)}
          </div>
        </Card>
      )}
    </div>
  )
}

/** "Meus pedidos": cliente sem conta consulta pelo código do pedido + telefone da compra. Nada de outros pedidos aparece. */
export function OrderLookupPage() {
  const { basePath } = useStore()
  const location = useLocation()
  const fromState = location.state as { code?: string; phone?: string } | null
  const saved = useRef<{ code: string; phone: string } | null>(null)
  if (saved.current === null) {
    try { saved.current = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { saved.current = null }
  }
  const [code, setCode] = useState(fromState?.code ?? saved.current?.code ?? '')
  const [phone, setPhone] = useState(fromState?.phone ?? saved.current?.phone ?? '')
  const [data, setData] = useState<LookupResult | null>(null)

  const search = useMutation({
    mutationFn: () => invokeShop<LookupResult>('shop-order-public', { action: 'lookup', code: code.trim().toUpperCase(), phone }),
    onSuccess: (r) => {
      setData(r)
      try { sessionStorage.setItem(KEY, JSON.stringify({ code: code.trim().toUpperCase(), phone })) } catch { /* sem armazenamento: só não lembra */ }
    },
    onError: (e) => { setData(null); toast.error((e as Error).message) },
  })

  // Veio da confirmação da compra (ou recarregou a página): consulta sozinho.
  const auto = useRef(false)
  useEffect(() => {
    if (!auto.current && code && phone.replace(/\D/g, '').length >= 10 && (fromState?.code || saved.current)) { auto.current = true; search.mutate() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1>Meus pedidos</h1>
      <Card className="p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim() && phone) search.mutate() }} className="space-y-3">
          <p className="text-sm text-muted-foreground">Informe o código do pedido (está no e-mail e na tela de confirmação) e o telefone usado na compra.</p>
          <div className="space-y-1.5"><Label htmlFor="lk-code">Código do pedido</Label>
            <Input id="lk-code" autoCapitalize="characters" autoComplete="off" maxLength={12} className="uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
          <div className="space-y-1.5"><Label htmlFor="lk-phone">Telefone</Label><PhoneInput id="lk-phone" value={phone} onChange={setPhone} /></div>
          <Button type="submit" className="w-full" disabled={search.isPending || code.trim().length < 6 || phone.replace(/\D/g, '').length < 10}>{search.isPending ? 'Buscando…' : 'Consultar pedido'}</Button>
        </form>
      </Card>
      {data && <OrderView data={data} phone={phone} onRefresh={() => search.mutate()} refreshing={search.isPending} />}
      <Link className="block text-center font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link>
    </div>
  )
}
