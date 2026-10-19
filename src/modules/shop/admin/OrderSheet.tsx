import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Input, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDateTime } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { useState } from 'react'
import { fromCents } from '../catalog'
import { KIND_LABEL, ORDER_STATUS_LABEL, fulfillmentLabel, fulfillmentSteps, orderActions, type FulfillmentStatus } from '../orders/transitions'
import { cancelOrder, listOrderEvents, markPaid, reactivateOrder, setFulfillment, type AdminOrder } from './ordersService'
import type { PickupPoint } from './service'

const money = (c: number) => formatCurrency(fromCents(c))
const STATUS_ANY: Record<string, string> = { ...ORDER_STATUS_LABEL, pending: 'Pendente', in_preparation: 'Em preparo', ready: 'Pronto', picked_up: 'Retirado', cancelled: 'Cancelado' }

export function OrderSheet({ order, pickup }: { order: AdminOrder; pickup: PickupPoint | undefined }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const events = useQuery({ queryKey: ['shop', orgId, 'order-events', order.id, order.status, order.shop_fulfillments.map((f) => f.status).join()], queryFn: () => listOrderEvents(order.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['shop', orgId] })
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { refresh(); toast.success('Pedido atualizado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const a = orderActions(order.status)
  const phone = order.customer_phone
  const wa = `https://wa.me/${phone}?text=${encodeURIComponent(`Olá, ${order.customer_name}! Sobre o seu pedido ${order.code} da loja:`)}`

  return (
    <SheetContent title={`Pedido ${order.code}`} description={`${ORDER_STATUS_LABEL[order.status]} · ${order.payment_method === 'pix' ? 'Pix' : 'InfinitePay'}`}>
      <div className="space-y-4 text-sm">
        <section className="space-y-1">
          <p className="font-semibold">{order.customer_name} {order.member_id && <Badge>Integrante</Badge>}</p>
          <p><a className="inline-flex items-center gap-1 text-primary hover:underline" href={wa} target="_blank" rel="noreferrer noopener"><MessageCircle className="h-4 w-4" /> {phone}</a></p>
          <p className="break-all"><a className="text-primary hover:underline" href={`mailto:${order.customer_email}`}>{order.customer_email}</a></p>
          <p className="text-muted-foreground">Retirada: {pickup ? `${pickup.name} — ${pickup.address}` : '—'}</p>
          <p className="text-muted-foreground">Feito em {formatDateTime(order.created_at)}{order.expires_at && ` · reservado até ${formatDateTime(order.expires_at)}`}</p>
        </section>

        <section className="space-y-1">
          <p className="font-semibold">Itens</p>
          <ul className="space-y-1">
            {order.shop_order_items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2"><span>{i.quantity}× {i.product_name} ({i.variant_label}){i.kind === 'made_to_order' ? ' · encomenda' : ''}</span><span>{money(i.unit_final_cents * i.quantity)}</span></li>
            ))}
          </ul>
          {order.discount_cents > 0 && <p className="flex justify-between text-primary"><span>Desconto de integrante</span><span>− {money(order.discount_cents)}</span></p>}
          <p className="flex justify-between text-base font-extrabold"><span>Total</span><span>{money(order.total_cents)}</span></p>
        </section>

        {a.canMarkPaid && (
          <section className="space-y-2 rounded-lg border border-border p-3">
            <p className="font-semibold">{order.status === 'payment_review' ? 'O cliente avisou que pagou' : 'Aguardando o pagamento'}</p>
            <p className="text-muted-foreground">Confira o pagamento de <strong>{money(order.total_cents)}</strong> (referência <strong>{order.code}</strong>) antes de confirmar.</p>
            <Button className="w-full" disabled={act.isPending} onClick={() => window.confirm(`Confirmar que o pagamento de ${money(order.total_cents)} foi recebido?`) && act.mutate(() => markPaid(order.id))}>Marcar como pago</Button>
          </section>
        )}
        {order.status === 'paid' && (
          <p className="text-muted-foreground">Pago em {formatDateTime(order.paid_at)} · {order.paid_via === 'webhook' ? 'confirmado automaticamente pela InfinitePay' : 'confirmado manualmente'}</p>
        )}
        {order.status === 'cancelled' && order.cancel_reason && <p className="text-muted-foreground">Motivo do cancelamento: {order.cancel_reason}</p>}
        {order.payment_ref?.paid_after_cancel === true && (
          <p role="alert" className="rounded-lg border border-destructive p-3 font-semibold text-destructive">O pagamento chegou depois do cancelamento. Reative o pedido (se ainda houver estoque) ou reembolse o cliente.</p>
        )}

        {a.canProgress && (
          <section className="space-y-2">
            <p className="font-semibold">Andamento</p>
            {order.shop_fulfillments.map((f) => {
              const steps = fulfillmentSteps(f.kind, f.status)
              return (
                <div key={f.id} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="flex items-center justify-between gap-2"><span className="font-semibold">{KIND_LABEL[f.kind]}</span><Badge>{fulfillmentLabel(f.kind, f.status)}</Badge></p>
                  <div className="flex flex-wrap gap-2">
                    {steps.next && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate(() => setFulfillment(order.id, f.kind, steps.next as FulfillmentStatus))}>Marcar: {fulfillmentLabel(f.kind, steps.next)}</Button>}
                    {steps.back && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => window.confirm('Voltar um passo?') && act.mutate(() => setFulfillment(order.id, f.kind, steps.back as FulfillmentStatus))}>Voltar para: {fulfillmentLabel(f.kind, steps.back)}</Button>}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {a.canReactivate && (
          <Button variant="outline" className="w-full" disabled={act.isPending} onClick={() => window.confirm('Reativar este pedido? O estoque será reservado de novo.') && act.mutate(() => reactivateOrder(order.id))}>Reativar pedido</Button>
        )}
        {a.canCancel && (
          <section className="space-y-2">
            <Input aria-label="Motivo do cancelamento" placeholder="Motivo do cancelamento (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="ghost" className="w-full text-destructive" disabled={act.isPending}
              onClick={() => window.confirm('Cancelar este pedido? Os itens em estoque voltam para a venda. Reembolsos são feitos por fora do sistema.') && act.mutate(() => cancelOrder(order.id, reason))}>Cancelar pedido</Button>
          </section>
        )}

        <section className="space-y-1">
          <p className="font-semibold">Histórico</p>
          {events.isLoading && <Skeleton className="h-10" />}
          <ul className="space-y-1">
            {events.data?.map((e) => (
              <li key={e.id} className="text-muted-foreground">
                {formatDateTime(e.created_at)} — {e.scope === 'fulfillment' ? `${e.note === 'made_to_order' ? 'Encomenda' : 'Pronta entrega'}: ` : ''}
                {STATUS_ANY[e.to_status] ?? e.to_status} <span className="text-foreground">({e.actor_label})</span>{e.scope === 'order' && e.note ? ` · ${e.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SheetContent>
  )
}
