import type { ProductKind } from '../catalog'
import { fulfillmentLabel, type FulfillmentStatus, type OrderStatus } from './transitions'

/** O que o cliente vê na tela "Meus pedidos" (regras puras; o servidor só devolve o que é dele). */
export interface TimelineEntry { scope: 'order' | 'fulfillment'; status: string; kind: ProductKind | null; at: string }

export const CUSTOMER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento', payment_review: 'Pagamento em conferência', paid: 'Pago', cancelled: 'Cancelado',
}

const ORDER_EVENT_LABEL: Record<string, string> = {
  awaiting_payment: 'Pedido recebido', payment_review: 'Pagamento informado — em conferência', paid: 'Pagamento confirmado', cancelled: 'Pedido cancelado',
}
const KIND_NAME: Record<ProductKind, string> = { stock: 'Pronta entrega', made_to_order: 'Sob encomenda' }

/** Frase de cada linha do histórico, sem nomes de quem atendeu. */
export function timelineLabel(e: TimelineEntry): string {
  if (e.scope === 'order') return ORDER_EVENT_LABEL[e.status] ?? e.status
  const kind = e.kind === 'stock' || e.kind === 'made_to_order' ? e.kind : null
  const what = kind ? fulfillmentLabel(kind, e.status as FulfillmentStatus) : e.status
  return kind ? `${KIND_NAME[kind]}: ${what}` : what
}

/** Etapas mostradas na barra de progresso de cada grupo. */
export function progressSteps(kind: ProductKind): { key: FulfillmentStatus; label: string }[] {
  const keys: FulfillmentStatus[] = kind === 'stock' ? ['pending', 'ready', 'picked_up'] : ['pending', 'in_preparation', 'ready', 'picked_up']
  return keys.map((key) => ({ key, label: fulfillmentLabel(kind, key) }))
}

/** Índice da etapa atual (-1 = cancelado, fora da barra). */
export function progressIndex(kind: ProductKind, status: FulfillmentStatus): number {
  return progressSteps(kind).findIndex((s) => s.key === status)
}

/** Texto curto "o que acontece agora" conforme o status do pedido. */
export function nextStepText(status: OrderStatus, paymentMethod: 'pix' | 'infinitepay'): string {
  switch (status) {
    case 'awaiting_payment': return paymentMethod === 'pix'
      ? 'Faça o Pix e envie o comprovante à loja. Depois toque em "Já fiz o pagamento".'
      : 'Conclua o pagamento no link da InfinitePay. A confirmação é automática.'
    case 'payment_review': return 'Estamos conferindo o seu pagamento. Você será avisado por e-mail quando for confirmado.'
    case 'paid': return 'Pagamento confirmado. Avisaremos por e-mail quando seus itens estiverem prontos para retirada.'
    case 'cancelled': return 'Este pedido foi cancelado. Se já pagou ou acha que foi engano, fale com a Direção.'
  }
}
