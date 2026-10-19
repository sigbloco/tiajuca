// Loja · montagem dos e-mails aos clientes. Funções PURAS (sem rede, sem Deno): testadas em templates.test.ts.
// Entrada: o contexto que a função SQL `shop_mail_claim` monta para cada item da fila. Saída: assunto, HTML e texto simples.
// Todo texto vindo de cliente/produto é escapado (nome, itens, motivo de cancelamento) para não injetar HTML no e-mail.

export type TemplateKey = 'order_created' | 'payment_review' | 'paid' | 'cancelled' | 'fulfillment_in_preparation' | 'fulfillment_ready' | 'fulfillment_picked_up'

export interface MailItem { name: string; variant: string; quantity: number; unit_final_cents: number; kind: 'stock' | 'made_to_order' }
export interface MailContext {
  outbox_id: string
  template: TemplateKey
  to_email: string
  kind: 'stock' | 'made_to_order' | null
  cancel_reason: string | null
  order: {
    code: string; customer_name: string; status: string; payment_method: 'pix' | 'infinitepay'
    subtotal_cents: number; discount_cents: number; total_cents: number; expires_at: string | null; payment_url: string | null; items: MailItem[]
  }
  pickup: { name: string; address: string; opening_hours: string }
  org: { name: string }
  settings: {
    pix_key: string | null; pix_beneficiary: string | null; public_site_url: string | null
    contact_whatsapp: string | null; contact_email: string | null; directors: { name: string; whatsapp: string }[] | null
    mail_from_name: string | null; mail_from_email: string | null
  } | null
}

export interface BuiltEmail { subject: string; html: string; text: string }

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const brl = (cents: number): string => {
  const [int, dec] = (cents / 100).toFixed(2).split('.')
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}

const KIND_NAME = { stock: 'pronta entrega', made_to_order: 'sob encomenda' } as const

function when(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

interface Section { html: string; text: string }
const p = (text: string): Section => ({ html: `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`, text })
const raw = (html: string, text: string): Section => ({ html, text })

function itemsSection(c: MailContext): Section {
  const o = c.order
  const lines = o.items.map((i) => `${i.quantity}× ${i.name} (${i.variant})${i.kind === 'made_to_order' ? ' — sob encomenda' : ''} — ${brl(i.unit_final_cents * i.quantity)}`)
  const html = `<ul style="margin:0 0 12px;padding-left:18px">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
    + (o.discount_cents > 0 ? `<p style="margin:0 0 4px">Desconto de integrante: − ${brl(o.discount_cents)}</p>` : '')
    + `<p style="margin:0 0 12px"><strong>Total: ${brl(o.total_cents)}</strong></p>`
  const text = [...lines.map((l) => `- ${l}`), o.discount_cents > 0 ? `Desconto de integrante: - ${brl(o.discount_cents)}` : '', `Total: ${brl(o.total_cents)}`].filter(Boolean).join('\n')
  return raw(html, text)
}

function pickupSection(c: MailContext): Section {
  const { name, address, opening_hours } = c.pickup
  const line = `${name} — ${address}${opening_hours ? ` (${opening_hours})` : ''}`
  return raw(`<p style="margin:0 0 12px"><strong>Retirada:</strong> ${escapeHtml(line)}<br>A retirada é combinada: avisaremos quando o pedido estiver pronto.</p>`,
    `Retirada: ${line}\nA retirada é combinada: avisaremos quando o pedido estiver pronto.`)
}

function paymentSection(c: MailContext): Section {
  const o = c.order
  const s = c.settings
  const deadline = o.expires_at ? ` Os itens ficam reservados até ${when(o.expires_at)}.` : ''
  if (o.payment_method === 'infinitepay') {
    if (!o.payment_url) return p(`Pague pelo link de pagamento da InfinitePay.${deadline}`)
    return raw(
      `<p style="margin:0 0 12px"><a href="${escapeHtml(o.payment_url)}" style="display:inline-block;background:#E93D2B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Pagar ${brl(o.total_cents)}</a><br>Cartão de crédito ou Pix, em uma página segura da InfinitePay.${escapeHtml(deadline)}</p>`,
      `Pagar ${brl(o.total_cents)} (cartão de crédito ou Pix, página segura da InfinitePay): ${o.payment_url}${deadline}`)
  }
  const key = s?.pix_key ?? ''
  return raw(
    `<p style="margin:0 0 4px"><strong>Pague com Pix</strong></p>`
    + `<p style="margin:0 0 12px">Valor exato: <strong>${brl(o.total_cents)}</strong><br>Chave Pix: <strong>${escapeHtml(key)}</strong>${s?.pix_beneficiary ? ` (${escapeHtml(s.pix_beneficiary)})` : ''}<br>`
    + `Referência: <strong>${escapeHtml(o.code)}</strong><br>Depois de pagar, envie o comprovante por WhatsApp ou e-mail.${escapeHtml(deadline)}</p>`,
    `Pague com Pix\nValor exato: ${brl(o.total_cents)}\nChave Pix: ${key}${s?.pix_beneficiary ? ` (${s.pix_beneficiary})` : ''}\nReferência: ${o.code}\nDepois de pagar, envie o comprovante por WhatsApp ou e-mail.${deadline}`)
}

function footerSection(c: MailContext): Section {
  const s = c.settings
  const site = s?.public_site_url?.replace(/\/+$/, '') ?? null
  const contacts: string[] = []
  if (s?.contact_whatsapp) contacts.push(`WhatsApp: https://wa.me/${s.contact_whatsapp}`)
  if (s?.contact_email) contacts.push(`E-mail: ${s.contact_email}`)
  for (const d of s?.directors ?? []) contacts.push(`${d.name}: https://wa.me/${d.whatsapp}`)
  const track = `Para consultar o pedido use o código ${c.order.code} e o telefone informado na compra.`
  const html = `<hr style="border:none;border-top:1px solid #ddd;margin:16px 0"><p style="margin:0 0 8px;font-size:13px;color:#555">${escapeHtml(track)}${site ? ` Loja: <a href="${escapeHtml(site)}">${escapeHtml(site)}</a>` : ''}</p>`
    + (contacts.length ? `<p style="margin:0;font-size:13px;color:#555">${contacts.map((l) => escapeHtml(l)).join('<br>')}</p>` : '')
  const text = ['--', track, site ? `Loja: ${site}` : '', ...contacts].filter(Boolean).join('\n')
  return raw(html, text)
}

export function buildEmail(c: MailContext): BuiltEmail {
  const o = c.order
  const hello = p(`Olá, ${o.customer_name}!`)
  const code = o.code
  const kindName = c.kind ? KIND_NAME[c.kind] : ''
  let subject = ''
  let body: Section[] = []

  switch (c.template) {
    case 'order_created':
      subject = `Pedido ${code} recebido — falta o pagamento`
      body = [hello, p(`Recebemos o seu pedido ${code}. Ele só é confirmado depois do pagamento, que é antecipado e integral.`), itemsSection(c), paymentSection(c), pickupSection(c)]
      break
    case 'payment_review':
      subject = `Pedido ${code}: pagamento em conferência`
      body = [hello, p(`Recebemos o aviso de pagamento do pedido ${code}. Estamos conferindo e você receberá outro e-mail assim que for confirmado.`), itemsSection(c)]
      break
    case 'paid':
      subject = `Pedido ${code}: pagamento confirmado`
      body = [hello, p(`O pagamento do pedido ${code} foi confirmado. Obrigado! Avisaremos quando os itens estiverem prontos para retirada.`), itemsSection(c), pickupSection(c)]
      break
    case 'cancelled':
      subject = `Pedido ${code} cancelado`
      body = [hello, p(`O pedido ${code} foi cancelado.${c.cancel_reason ? ` Motivo: ${c.cancel_reason}.` : ''} Se você já pagou ou acha que houve um engano, fale com a gente pelos contatos abaixo.`)]
      break
    case 'fulfillment_in_preparation':
      subject = `Pedido ${code}: seus itens ${kindName} estão em preparo`
      body = [hello, p(`Os itens ${kindName} do pedido ${code} estão em preparo. Avisaremos quando ficarem prontos para retirada.`)]
      break
    case 'fulfillment_ready':
      subject = `Pedido ${code}: itens ${kindName} prontos para retirada`
      body = [hello, p(`Os itens ${kindName} do pedido ${code} estão prontos para retirada. Combine o dia e o horário com a gente pelos contatos abaixo.`), pickupSection(c)]
      break
    case 'fulfillment_picked_up':
      subject = `Pedido ${code}: retirada dos itens ${kindName} registrada`
      body = [hello, p(`Registramos a retirada dos itens ${kindName} do pedido ${code}. Obrigado e até a próxima!`)]
      break
  }
  body.push(footerSection(c))

  const org = escapeHtml(c.org.name)
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:16px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px;font-size:18px">${org}</h2>${body.map((b) => b.html).join('')}</div></body></html>`
  const text = `${c.org.name}\n\n${body.map((b) => b.text).join('\n\n')}\n`
  return { subject, html, text }
}
