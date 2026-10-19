import { fromCents } from '../catalog'
import type { PaymentMethodKey } from '../config/schema'

/**
 * Métodos de pagamento: cada um é um módulo com a mesma forma. A lógica de pedidos não conhece o método.
 *  • iniciar  → `instructions(...)`: o que o cliente precisa fazer (aqui, no navegador; a InfinitePay também cria o link no servidor).
 *  • confirmar → sempre por transição de status do pedido (manual no painel; automática via webhook na InfinitePay).
 * Chave Pix e contatos vêm das configurações da loja (painel), entregues pela vitrine.
 */
export interface PixInfo { key: string; beneficiary: string }
export interface DirectorContact { name: string; whatsapp: string }
export interface ContactInfo { whatsapp: string | null; email: string | null; directors: DirectorContact[] }

export interface PaymentInstructionsInput { pix: PixInfo; contact: ContactInfo; orderCode: string; totalCents: number; customerName: string }

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
export function pixInstructions({ pix, contact, orderCode, totalCents, customerName }: PaymentInstructionsInput): PixInstructions {
  const amountText = brl(totalCents)
  const proofText = `Olá! Segue o comprovante do Pix do pedido ${orderCode} (${amountText}), em nome de ${customerName}.`
  return {
    kind: 'pix',
    key: pix.key,
    beneficiary: pix.beneficiary,
    amountCents: totalCents,
    amountText,
    reference: orderCode,
    proofText,
    whatsappUrl: contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(proofText)}` : null,
    mailtoUrl: contact.email ? `mailto:${contact.email}?subject=${encodeURIComponent(`Comprovante do pedido ${orderCode}`)}&body=${encodeURIComponent(proofText)}` : null,
  }
}

/** Métodos que o sistema sabe executar. A InfinitePay também precisa da InfiniteTag configurada no painel. */
export const IMPLEMENTED_METHODS: readonly PaymentMethodKey[] = ['pix', 'infinitepay']

export const METHOD_LABELS: Record<PaymentMethodKey, { label: string; hint: string }> = {
  pix: { label: 'Pix', hint: 'Você paga pelo seu banco e envia o comprovante. Confirmamos manualmente.' },
  infinitepay: { label: 'Cartão de crédito ou Pix (InfinitePay)', hint: 'Você paga em uma página segura da InfinitePay.' },
}

/** Dos métodos que a loja habilitou (painel → Pagamentos), os que o sistema sabe executar. */
export function availableMethods(enabled: readonly string[]): PaymentMethodKey[] {
  return IMPLEMENTED_METHODS.filter((m) => enabled.includes(m))
}

/** Motivos para NÃO deixar o cliente finalizar (configuração incompleta). Lista vazia = pode vender. */
export function checkoutBlockers(method: PaymentMethodKey, store: { pix: PixInfo | null; contact: ContactInfo }): string[] {
  const out: string[] = []
  if (method === 'pix' && !store.pix) out.push('A chave Pix da loja ainda não foi configurada.')
  if (!store.contact.whatsapp && !store.contact.email) out.push('Os contatos da loja (WhatsApp ou e-mail) ainda não foram configurados.')
  return out
}

export interface DirectorLink { name: string; url: string }

/** Links de WhatsApp para falar direto com alguém da Direção sobre o pedido. */
export function directorLinks(contact: ContactInfo, orderCode?: string): DirectorLink[] {
  const text = orderCode ? `Olá! Preciso de ajuda com o pedido ${orderCode} da loja.` : 'Olá! Tenho uma dúvida sobre a loja.'
  return contact.directors.map((d) => ({ name: d.name, url: `https://wa.me/${d.whatsapp}?text=${encodeURIComponent(text)}` }))
}
