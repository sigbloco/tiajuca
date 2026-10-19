import type { ProductKind } from '../catalog'

/** Status e transições dos pedidos. ESPELHA `shop_transition_allowed` (SQL): o banco é quem decide; aqui só montamos os botões. */
export type OrderStatus = 'awaiting_payment' | 'payment_review' | 'paid' | 'cancelled'
export type FulfillmentStatus = 'pending' | 'in_preparation' | 'ready' | 'picked_up' | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento', payment_review: 'Pagamento em conferência', paid: 'Pago', cancelled: 'Cancelado',
}
export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]

export const KIND_LABEL: Record<ProductKind, string> = { stock: 'Pronta entrega', made_to_order: 'Sob encomenda' }

/** Rótulos do andamento de cada grupo. "pending" fala de coisas diferentes em cada tipo. */
export function fulfillmentLabel(kind: ProductKind, status: FulfillmentStatus): string {
  switch (status) {
    case 'pending': return kind === 'stock' ? 'Separando' : 'Na fila de produção'
    case 'in_preparation': return 'Em preparo'
    case 'ready': return 'Pronto para retirada'
    case 'picked_up': return 'Retirado'
    case 'cancelled': return 'Cancelado'
  }
}

const FORWARD: Record<ProductKind, Partial<Record<FulfillmentStatus, FulfillmentStatus>>> = {
  stock: { pending: 'ready', ready: 'picked_up' },
  made_to_order: { pending: 'in_preparation', in_preparation: 'ready', ready: 'picked_up' },
}
const BACK: Record<ProductKind, Partial<Record<FulfillmentStatus, FulfillmentStatus>>> = {
  stock: { ready: 'pending', picked_up: 'ready' },
  made_to_order: { in_preparation: 'pending', ready: 'in_preparation', picked_up: 'ready' },
}

export function isTransitionAllowed(kind: ProductKind, from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FORWARD[kind][from] === to || BACK[kind][from] === to
}

/** Próximo passo e passo anterior de um grupo (null = não há). */
export function fulfillmentSteps(kind: ProductKind, status: FulfillmentStatus): { next: FulfillmentStatus | null; back: FulfillmentStatus | null } {
  return { next: FORWARD[kind][status] ?? null, back: BACK[kind][status] ?? null }
}

/** O que o cliente/administração pode fazer com o pedido em cada status. */
export function orderActions(status: OrderStatus): { canMarkPaid: boolean; canCancel: boolean; canReactivate: boolean; canProgress: boolean } {
  return {
    canMarkPaid: status === 'awaiting_payment' || status === 'payment_review',
    canCancel: status !== 'cancelled',
    canReactivate: status === 'cancelled',
    canProgress: status === 'paid',
  }
}
