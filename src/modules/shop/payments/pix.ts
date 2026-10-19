import { fromCents } from '../catalog'
import { PENDING, type PaymentMethodKey, type ShopConfig } from '../config/schema'

/**
 * Métodos de pagamento: cada um é um módulo com a mesma forma. A lógica de pedidos não conhece o método.
 *  • iniciar  → `instructions(...)`: o que o cliente precisa fazer (aqui, no navegador; a InfinitePay também cria o link no servidor).
 *  • confirmar → sempre por transição de status do pedido (manual no painel; automática via webhook na InfinitePay).
 */
export interface PaymentInstructionsInput { config: ShopConfig; orderCode: string; totalCents: number; customerName: string }

export interface PixInstructions {
  kind: 'pix'
  key: string
  beneficiary: string
  amountCents: number
  amountText: string
  reference: string
  proofText: string
  whatsappUrl: string | null
  mailtoUrl: string | null
}

const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fromCents(cents))

/** Pix manual: chave do bloco, valor exato e o código do pedido como referência. O comprovante vai por WhatsApp ou e-mail. */
export function pixInstructions({ config, orderCode, totalCents, customerName }: PaymentInstructionsInput): PixInstructions {
  const amountText = brl(totalCents)
  const proofText = `Olá! Segue o comprovante do Pix do pedido ${orderCode} (${amountText}), em nome de ${customerName}.`
  const { whatsapp, email } = config.contact
  return {
    kind: 'pix',
    key: config.pix.key,
    beneficiary: config.pix.beneficiary,
    amountCents: totalCents,
    amountText,
    reference: orderCode,
    proofText,
    whatsappUrl: whatsapp !== PENDING ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(proofText)}` : null,
    mailtoUrl: email !== PENDING ? `mailto:${email}?subject=${encodeURIComponent(`Comprovante do pedido ${orderCode}`)}&body=${encodeURIComponent(proofText)}` : null,
  }
}

/** Métodos que o sistema sabe executar de verdade hoje (a InfinitePay entra na etapa 5). */
export const IMPLEMENTED_METHODS: readonly PaymentMethodKey[] = ['pix']

export const METHOD_LABELS: Record<PaymentMethodKey, { label: string; hint: string }> = {
  pix: { label: 'Pix', hint: 'Você paga pelo seu banco e envia o comprovante. Confirmamos manualmente.' },
  infinitepay: { label: 'Cartão de crédito ou Pix (InfinitePay)', hint: 'Você paga em uma página segura da InfinitePay.' },
}

/** Habilitados na configuração E implementados no sistema. */
export function availableMethods(config: ShopConfig): PaymentMethodKey[] {
  return config.paymentMethods.filter((m) => IMPLEMENTED_METHODS.includes(m))
}

/** Motivos para NÃO deixar o cliente finalizar (configuração incompleta). Lista vazia = pode vender. */
export function checkoutBlockers(config: ShopConfig, method: PaymentMethodKey): string[] {
  const out: string[] = []
  if (method === 'pix' && (config.pix.key === PENDING || config.pix.beneficiary === PENDING)) out.push('A chave Pix da loja ainda não foi configurada.')
  if (config.contact.whatsapp === PENDING && config.contact.email === PENDING) out.push('Os contatos da loja (WhatsApp ou e-mail) ainda não foram configurados.')
  return out
}
