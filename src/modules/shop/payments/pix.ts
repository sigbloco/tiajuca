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
  infinitepay: { label: 'Cartão de crédito (InfinitePay)', hint: 'Você paga em uma página segura da InfinitePay.' },
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

/** Links de WhatsApp para falar direto com alguém da direção sobre o pedido. */
export function directorLinks(contact: ContactInfo, orderCode?: string): DirectorLink[] {
  const text = orderCode ? `Olá! Preciso de ajuda com o pedido ${orderCode} da loja.` : 'Olá! Tenho uma dúvida sobre a loja.'
  return contact.directors.map((d) => ({ name: d.name, url: `https://wa.me/${d.whatsapp}?text=${encodeURIComponent(text)}` }))
}

export interface PickupWhatsApp { id: string; name: string; url: string }

/** Links de WhatsApp dos pontos de retirada para enviar o comprovante do Pix. O ponto do pedido (`firstId`) vem primeiro. */
export function pickupWhatsAppLinks(
  points: readonly { id: string; name: string; contact_name?: string | null; contact_phone?: string | null }[],
  opts: { orderCode?: string; totalCents?: number; customerName?: string; firstId?: string } = {},
): PickupWhatsApp[] {
  const text = opts.orderCode
    ? `Olá! Já fiz o Pix do pedido ${opts.orderCode}${opts.totalCents ? ` (${brl(opts.totalCents)})` : ''}${opts.customerName ? `, em nome de ${opts.customerName}` : ''}. Segue o comprovante.`
    : 'Olá! Já fiz o Pix da minha compra na loja. Segue o comprovante.'
  const out: PickupWhatsApp[] = []
  for (const p of points) {
    const d = (p.contact_phone ?? '').replace(/\D/g, '')
    if (d.length < 10) continue
    out.push({ id: p.id, name: `${p.name.replace(/^combinar com\s+/i, '').replace(/^(a|o)\s+/i, '') || p.contact_name?.trim().split(/\s+/)[0] || p.name}`, url: `https://wa.me/${d.startsWith('55') ? d : '55' + d}?text=${encodeURIComponent(text)}` })
  }
  return opts.firstId ? [...out.filter((o) => o.id === opts.firstId), ...out.filter((o) => o.id !== opts.firstId)] : out
}

/**
 * Taxas oficiais da InfinitePay no cartão de crédito, repassadas a quem paga na página de pagamento.
 * O valor final é o do pedido dividido por (1 − taxa), arredondado para cima (R$ 48,00 à vista virou R$ 50,11 num pedido real).
 */
export const CREDIT_FEES_PCT: readonly number[] = [4.2, 6.09, 7.01, 7.91, 8.8, 9.67, 12.59, 13.42, 14.25, 15.06, 15.87, 16.66]
export const creditTotalCents = (cents: number, installments = 1): number => Math.ceil(cents / (1 - (CREDIT_FEES_PCT[installments - 1] ?? CREDIT_FEES_PCT[0]) / 100) - 1e-9)
export const creditFeeCents = (cents: number, installments = 1): number => creditTotalCents(cents, installments) - cents
export const formatPct = (n: number): string => n.toFixed(2).replace('.', ',') + '%'

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** CRC16/CCITT-FALSE exigido pelo BR Code do Pix. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const clean = (s: string, max: number) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max)

/** Pix "copia e cola" (BR Code estático) com o valor já preenchido. `txid` = código do pedido (só letras e números, até 25). */
export function pixCopyPaste(a: { key: string; beneficiary: string; amountCents: number; txid: string; city?: string }): string {
  const body =
    tlv('00', '01') +
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', a.key.trim())) +
    tlv('52', '0000') + tlv('53', '986') + tlv('54', (a.amountCents / 100).toFixed(2)) + tlv('58', 'BR') +
    tlv('59', clean(a.beneficiary, 25) || 'LOJA') + tlv('60', clean(a.city ?? 'Rio de Janeiro', 15) || 'BRASIL') +
    tlv('62', tlv('05', a.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) + '6304'
  return body + crc16(body)
}

/**
 * Links para enviar o comprovante: o(s) ponto(s) de retirada dados + SEMPRE o WhatsApp de quem recebe o Pix (o favorecido da chave),
 * procurado entre os pontos de retirada e a direção pelo primeiro nome.
 */
export function proofLinks(a: {
  points: readonly { id: string; name: string; contact_name?: string | null; contact_phone?: string | null }[]
  allPoints: readonly { id: string; name: string; contact_name?: string | null; contact_phone?: string | null }[]
  directors: readonly DirectorContact[]
  beneficiary: string
  orderCode?: string; totalCents?: number; customerName?: string; firstId?: string
}): PickupWhatsApp[] {
  const text = { orderCode: a.orderCode, totalCents: a.totalCents, customerName: a.customerName, firstId: a.firstId }
  const out = pickupWhatsAppLinks(a.points, text)
  const first = (a.beneficiary.trim().split(/\s+/)[0] ?? '').toLowerCase()
  if (!first) return out
  const hit = a.allPoints.find((p) => (p.contact_phone ?? '').replace(/\D/g, '').length >= 10 && `${p.name} ${p.contact_name ?? ''}`.toLowerCase().includes(first))
  if (hit) {
    const l = pickupWhatsAppLinks([hit], text)[0]
    if (l && !out.some((o) => o.id === hit.id)) out.push(l)
    return out
  }
  const dir = a.directors.find((d) => d.name.toLowerCase().includes(first))
  if (dir) {
    const msg = a.orderCode ? `Olá! Já fiz o Pix do pedido ${a.orderCode}${a.totalCents ? ` (${brl(a.totalCents)})` : ''}${a.customerName ? `, em nome de ${a.customerName}` : ''}. Segue o comprovante.` : 'Olá! Já fiz o Pix da minha compra na loja. Segue o comprovante.'
    out.push({ id: 'beneficiary', name: `${dir.name.trim().split(/\s+/)[0]}`, url: `https://wa.me/${dir.whatsapp}?text=${encodeURIComponent(msg)}` })
  }
  return out
}
