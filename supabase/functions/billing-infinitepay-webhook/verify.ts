// InfinitePay · webhook de pagamento aprovado. Funções PURAS (sem rede), testadas em verify.test.ts.
// Documentação: POST na webhook_url com { invoice_slug, amount, paid_amount, installments, capture_method, transaction_nsu, order_nsu, receipt_url, items }.
// NÃO há assinatura documentada. Por isso o corpo do webhook nunca é confiado: o pagamento só vale depois de confirmado na
// API `payment_check` da própria InfinitePay e com o valor igual ao total do pedido.

export const PAYMENT_CHECK_ENDPOINT = 'https://api.checkout.infinitepay.io/payment_check'

export interface WebhookBody {
  order_nsu: string
  transaction_nsu: string
  invoice_slug: string
  amount: number | null
  paid_amount: number | null
  capture_method: string | null
  receipt_url: string | null
}

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** Aceita só o que precisamos e descarta o resto. Devolve null se faltar o identificador do pedido ou da transação. */
export function parseWebhook(raw: unknown): WebhookBody | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const order = str(r.order_nsu, 12)
  const tx = str(r.transaction_nsu)
  const slug = str(r.invoice_slug)
  if (!order || !/^[A-Z0-9]{6,12}$/.test(order) || !tx || !slug) return null
  return {
    order_nsu: order, transaction_nsu: tx, invoice_slug: slug,
    amount: int(r.amount), paid_amount: int(r.paid_amount),
    capture_method: str(r.capture_method, 30), receipt_url: str(r.receipt_url, 500),
  }
}

export interface PaymentCheck { success?: boolean; paid?: boolean; amount?: number; paid_amount?: number; installments?: number; capture_method?: string }

/**
 * Confirma que a InfinitePay diz "pago" e que o valor cobre o pedido. `amount` (valor do link) precisa ser igual ao total;
 * `paid_amount` pode ser maior (parcelamento com juros repassado ao cliente), nunca menor.
 */
export function isPaymentConfirmed(check: unknown, expectedTotalCents: number): boolean {
  if (!check || typeof check !== 'object') return false
  const c = check as PaymentCheck
  if (c.success === false || c.paid !== true) return false
  const amount = typeof c.amount === 'number' ? c.amount : null
  const paid = typeof c.paid_amount === 'number' ? c.paid_amount : amount
  if (amount === null || paid === null) return false
  return amount === expectedTotalCents && paid >= expectedTotalCents
}
