import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Badge, Card, EmptyState, Input, Select, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { formatCurrency, formatDateTime } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { fromCents } from '../catalog'
import { KIND_LABEL, ORDER_STATUSES, ORDER_STATUS_LABEL, fulfillmentLabel } from '../orders/transitions'
import { OrderSheet } from './OrderSheet'
import { EMPTY_ORDER_FILTERS, ORDERS_LIMIT, listOrders, matchesOrder, type AdminOrder, type OrderFilters } from './ordersService'
import { listPickupPoints } from './service'

const STATUS_STYLE: Record<AdminOrder['status'], string> = {
  awaiting_payment: 'bg-muted', payment_review: 'bg-secondary text-secondary-foreground', paid: 'bg-primary/15 text-primary', cancelled: 'bg-muted text-muted-foreground line-through',
}

export function OrdersTab() {
  const orgId = useOrgId()
  const [filters, setFilters] = useState<OrderFilters>(EMPTY_ORDER_FILTERS)
  const [text, setText] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const orders = useQuery({ queryKey: ['shop', orgId, 'orders', filters], queryFn: () => listOrders(orgId, filters), refetchInterval: 60_000 })
  const points = useQuery({ queryKey: ['shop', orgId, 'pickup'], queryFn: () => listPickupPoints(orgId) })
  const pointName = useMemo(() => new Map((points.data ?? []).map((p) => [p.id, p])), [points.data])
  const shown = (orders.data ?? []).filter((o) => matchesOrder(o, text))
  const current = openId ? orders.data?.find((o) => o.id === openId) ?? null : null
  const toCheck = (orders.data ?? []).filter((o) => o.status === 'payment_review').length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Pedidos</h2>
        {toCheck > 0 && filters.status === 'all' && <Badge className="bg-secondary text-secondary-foreground">{toCheck} pagamento(s) para conferir</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input aria-label="Buscar pedido" placeholder="Código, nome, telefone ou e-mail" value={text} onChange={(e) => setText(e.target.value)} />
        <Select aria-label="Filtrar por status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as OrderFilters['status'] })}>
          <option value="all">Todos os status</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select aria-label="Filtrar por forma de pagamento" value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value as OrderFilters['method'] })}>
          <option value="all">Todas as formas de pagamento</option>
          <option value="pix">Pix</option>
          <option value="infinitepay">InfinitePay</option>
        </Select>
        <Select aria-label="Filtrar por ponto de retirada" value={filters.pickup} onChange={(e) => setFilters({ ...filters, pickup: e.target.value })}>
          <option value="all">Todos os pontos de retirada</option>
          {(points.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {orders.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {orders.isError && <EmptyState>Não foi possível carregar os pedidos.</EmptyState>}
      {orders.data && shown.length === 0 && <EmptyState>{orders.data.length === 0 ? 'Nenhum pedido encontrado.' : 'Nenhum pedido com essa busca.'}</EmptyState>}
      {orders.data && orders.data.length >= ORDERS_LIMIT && <p className="text-sm text-muted-foreground">Mostrando os {ORDERS_LIMIT} pedidos mais recentes. Use os filtros para refinar.</p>}

      {shown.map((o) => (
        <button key={o.id} type="button" className="block w-full text-left" onClick={() => setOpenId(o.id)}>
          <Card className="space-y-1 p-3 transition hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold tracking-wider">{o.code} <span className="font-normal tracking-normal text-muted-foreground">· {o.customer_name}</span></p>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span>
            </div>
            <p className="text-sm">{formatCurrency(fromCents(o.total_cents))} · {o.payment_method === 'pix' ? 'Pix' : 'InfinitePay'} · {pointName.get(o.pickup_point_id)?.name ?? 'ponto removido'}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{formatDateTime(o.created_at)}</span>
              {o.status === 'paid' && o.shop_fulfillments.map((f) => <Badge key={f.id}>{KIND_LABEL[f.kind]}: {fulfillmentLabel(f.kind, f.status)}</Badge>)}
            </div>
          </Card>
        </button>
      ))}

      <Sheet open={current !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        {current && <OrderSheet key={current.id} order={current} pickup={pointName.get(current.pickup_point_id)} />}
      </Sheet>
    </div>
  )
}
