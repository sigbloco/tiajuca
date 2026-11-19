// Loja · montagem dos e-mails aos clientes. Funções PURAS (sem rede, sem Deno): testadas em templates.test.ts.
// Entrada: o contexto que a função SQL `shop_mail_claim` monta para cada item da fila. Saída: assunto, HTML e texto simples.
// Todo texto vindo de cliente/produto é escapado (nome, itens, motivo de cancelamento) para não injetar HTML no e-mail.

export type TemplateKey = 'order_created' | 'payment_review' | 'paid' | 'cancelled' | 'fulfillment_in_preparation' | 'fulfillment_ready' | 'fulfillment_picked_up' | 'production_started'

import { pixCopyPaste } from './pix.ts'

/** Id da imagem do QR code embutida no e-mail (`<img src="cid:pixqr">`). */
export const PIX_QR_CID = 'pixqr'

export interface MailItem {
  name: string; variant: string; quantity: number; unit_final_cents: number; kind: 'stock' | 'made_to_order'
  product_id?: string | null
  /** Meta mínima do produto sob encomenda: unidades pagas até agora (nulo = sem meta). */
  progress?: { min_units: number; confirmed_units: number } | null
}
export interface MailContext {
  outbox_id: string
  template: TemplateKey
  to_email: string
  kind: 'stock' | 'made_to_order' | null
  cancel_reason: string | null
  /** Só no aviso "production_started": o produto que chegou ao mínimo. */
  product?: { name: string; min_units: number | null; lead_time_days: string | null } | null
  order: {
    code: string; customer_name: string; status: string; payment_method: 'pix' | 'infinitepay'
    subtotal_cents: number; discount_cents: number; coupon_code?: string | null; coupon_discount_cents?: number; total_cents: number; expires_at: string | null; payment_url: string | null; items: MailItem[]
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
  // O desconto total inclui o do cupom: separa para mostrar cada um na sua linha.
  const couponOff = o.coupon_discount_cents ?? 0
  const memberOff = Math.max(0, o.discount_cents - couponOff)
  const lines = o.items.map((i) => `${i.quantity}× ${i.name} (${i.variant})${i.kind === 'made_to_order' ? ' — sob encomenda' : ''} — ${brl(i.unit_final_cents * i.quantity)}`)
  const html = `<ul style="margin:0 0 12px;padding-left:18px">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
    + (memberOff > 0 ? `<p style="margin:0 0 4px">Desconto de integrante: − ${brl(memberOff)}</p>` : '')
    + (couponOff > 0 ? `<p style="margin:0 0 4px">Cupom ${escapeHtml(o.coupon_code ?? '')}: − ${brl(couponOff)}</p>` : '')
    + `<p style="margin:0 0 12px"><strong>Total: ${brl(o.total_cents)}</strong></p>`
  const text = [...lines.map((l) => `- ${l}`), memberOff > 0 ? `Desconto de integrante: - ${brl(memberOff)}` : '', couponOff > 0 ? `Cupom ${o.coupon_code ?? ''}: - ${brl(couponOff)}` : '', `Total: ${brl(o.total_cents)}`].filter(Boolean).join('\n')
  return raw(html, text)
}

function pickupSection(c: MailContext): Section {
  const { name, address, opening_hours } = c.pickup
  const line = `${name} — ${address}${opening_hours ? ` (${opening_hours})` : ''}`
  return raw(`<p style="margin:0 0 12px"><strong>Retirada:</strong> ${escapeHtml(line)}<br>A retirada é combinada: avisaremos quando o pedido estiver pronto.</p>`,
    `Retirada: ${line}\nA retirada é combinada: avisaremos quando o pedido estiver pronto.`)
}

function paymentSection(c: MailContext, qrCid: string | null): Section {
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
  const code = pixCodeFor(c)
  const proof = proofSection(c)
  const qr = code && qrCid ? `<p style="margin:0 0 12px"><img src="cid:${escapeHtml(qrCid)}" width="200" height="200" alt="QR code do Pix" style="display:block;border:1px solid #ddd;border-radius:8px"></p>` : ''
  const copy = code
    ? `<p style="margin:0 0 4px">Pix copia e cola:</p><p style="margin:0 0 12px;padding:8px;background:#f3f3f3;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all">${escapeHtml(code)}</p>`
    : ''
  return raw(
    `<p style="margin:0 0 4px"><strong>Pague com Pix</strong></p>`
    + `<p style="margin:0 0 12px">Valor exato: <strong>${brl(o.total_cents)}</strong><br>Chave Pix: <strong>${escapeHtml(key)}</strong>${s?.pix_beneficiary ? ` (${escapeHtml(s.pix_beneficiary)})` : ''}<br>`
    + `Referência: <strong>${escapeHtml(o.code)}</strong>${escapeHtml(deadline)}</p>`
    + qr + copy + proof.html,
    `Pague com Pix\nValor exato: ${brl(o.total_cents)}\nChave Pix: ${key}${s?.pix_beneficiary ? ` (${s.pix_beneficiary})` : ''}\nReferência: ${o.code}${deadline}`
    + (code ? `\n\nPix copia e cola:\n${code}` : '') + `\n\n${proof.text}`)
}

/** Pix "copia e cola" do pedido (valor exato e código do pedido); nulo se a chave Pix da loja não estiver cadastrada. */
export function pixCodeFor(c: MailContext): string | null {
  const s = c.settings
  if (c.order.payment_method !== 'pix' || !s?.pix_key) return null
  return pixCopyPaste({ key: s.pix_key, beneficiary: s.pix_beneficiary ?? '', amountCents: c.order.total_cents, txid: c.order.code })
}

/** WhatsApp de quem recebe o comprovante: a direção com o primeiro nome do favorecido da chave; senão o contato da loja; senão a primeira da direção. */
function proofWhatsApp(c: MailContext): string | null {
  const s = c.settings
  const first = (s?.pix_beneficiary?.trim().split(/\s+/)[0] ?? '').toLowerCase()
  const dir = first ? s?.directors?.find((d) => d.name.toLowerCase().includes(first)) : undefined
  return dir?.whatsapp || s?.contact_whatsapp || s?.directors?.[0]?.whatsapp || null
}

function proofSection(c: MailContext): Section {
  const o = c.order
  const s = c.settings
  const text = `Olá! Segue o comprovante do Pix do pedido ${o.code} (${brl(o.total_cents)}), em nome de ${o.customer_name}.`
  const zap = proofWhatsApp(c)
  const link = zap ? `https://wa.me/${zap}?text=${encodeURIComponent(text)}` : null
  const byMail = !!(s?.contact_email || s?.mail_from_email)
  if (!byMail && !link) return raw('', 'Depois de pagar, envie o comprovante para a gente.')
  const html = `<p style="margin:0 0 12px"><strong>Já pagou?</strong> ${byMail ? 'Responda este e-mail com o comprovante' : 'Envie o comprovante'}${link ? ` ou mande pelo WhatsApp: <a href="${escapeHtml(link)}" style="color:#E93D2B;font-weight:bold">enviar comprovante</a>` : ''}.</p>`
  const plain = `Já pagou? ${byMail ? 'Responda este e-mail com o comprovante' : 'Envie o comprovante'}${link ? ` ou mande pelo WhatsApp: ${link}` : ''}.`
  return raw(html, plain)
}

/** Aviso da meta mínima dos produtos sob encomenda do pedido (um por produto): quanto falta para a produção começar. */
function remainingSection(c: MailContext): Section | null {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const i of c.order.items) {
    const key = i.product_id ?? i.name
    if (!i.progress || seen.has(key)) continue
    seen.add(key)
    const left = Math.max(0, i.progress.min_units - i.progress.confirmed_units)
    lines.push(left === 0
      ? `A produção de ${i.name} já começou. Avisaremos quando estiver pronto para retirada.`
      : `Faltam ${left} ${left === 1 ? 'unidade paga' : 'unidades pagas'} para a produção de ${i.name} começar (${i.progress.confirmed_units} de ${i.progress.min_units}). Avisaremos quando começar.`)
  }
  if (lines.length === 0) return null
  return { html: lines.map((l) => `<p style="margin:0 0 12px;padding:10px;border:1px solid #E93D2B;border-radius:8px;background:#fdecea">${escapeHtml(l)}</p>`).join(''), text: lines.join('\n') }
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

/** `qrCid`: id da imagem do QR code do Pix anexada ao e-mail (sem ele, só vai o código "copia e cola"). */
export function buildEmail(c: MailContext, opts: { qrCid?: string | null } = {}): BuiltEmail {
  const o = c.order
  const hello = p(`Olá, ${o.customer_name}!`)
  const code = o.code
  const kindName = c.kind ? KIND_NAME[c.kind] : ''
  let subject = ''
  let body: Section[] = []

  switch (c.template) {
    case 'order_created':
      subject = `Pedido ${code} recebido — falta o pagamento`
      body = [hello, p(`Recebemos o seu pedido ${code}. Ele só é confirmado depois do pagamento, que é antecipado e integral.`), itemsSection(c), paymentSection(c, opts.qrCid ?? null), pickupSection(c)]
      break
    case 'payment_review':
      subject = `Pedido ${code}: pagamento em conferência`
      body = [hello, p(`Recebemos o aviso de pagamento do pedido ${code}. Estamos conferindo e você receberá outro e-mail assim que for confirmado.`), itemsSection(c)]
      break
    case 'paid':
      subject = `Pedido ${code}: pagamento confirmado`
      body = [hello, p(`O pagamento do pedido ${code} foi confirmado. Obrigado! Avisaremos quando os itens estiverem prontos para retirada.`), ...(remainingSection(c) ? [remainingSection(c)!] : []), itemsSection(c), pickupSection(c)]
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
    case 'production_started': {
      const prod = c.product?.name ?? 'Seu produto'
      const min = c.product?.min_units
      const lead = c.product?.lead_time_days
      subject = `${prod}: chegamos ao mínimo, a produção começou!`
      body = [
        hello,
        p(`Boa notícia! ${prod} chegou a ${min ? `${min} unidades pagas` : 'o mínimo de unidades pagas'} e a produção já começou. O seu pedido ${code} está incluído.`),
        p(lead ? `O prazo de produção (${lead}) conta a partir de agora. Avisaremos quando estiver pronto para retirada.` : 'Avisaremos quando estiver pronto para retirada.'),
        itemsSection(c), pickupSection(c),
      ]
      break
    }
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

/** Aviso ao inscrito (formulários): vem da fila form_email_outbox. */
export interface FormMailContext {
  outbox_id: string
  template: 'submission_approved' | 'submission_rejected' | 'submission_waitlist'
  to_email: string
  name: string | null
  /** Texto do e-mail: o do formulário (aprovação) ou o que a direção escreveu ao rejeitar. */
  message?: string | null
  org: { name: string }
  settings: MailContext['settings']
}

// Texto com formatação simples (o mesmo do editor): **negrito**, *itálico*, [texto](https://link) e linhas com "- " viram lista.
// Tudo é escapado: nada do que a direção escreve vira HTML solto.
const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g

function inlineHtml(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    out += escapeHtml(text.slice(last, at))
    if (m[1] !== undefined) out += `<strong>${inlineHtml(m[1])}</strong>`
    else if (m[2] !== undefined) out += `<em>${inlineHtml(m[2])}</em>`
    else out += `<a href="${escapeHtml(m[4])}" style="color:#E93D2B">${inlineHtml(m[3])}</a>`
    last = at + m[0].length
  }
  return out + escapeHtml(text.slice(last))
}

function inlineText(text: string): string {
  return text.replace(INLINE, (_m, b, i, label, href) => (b !== undefined ? inlineText(b) : i !== undefined ? inlineText(i) : `${inlineText(label)} (${href})`))
}

export function richSections(text: string): Section[] {
  const out: Section[] = []
  let items: string[] = []
  const flush = () => {
    if (!items.length) return
    out.push({ html: `<ul style="margin:0 0 12px;padding-left:18px">${items.map((x) => `<li>${inlineHtml(x)}</li>`).join('')}</ul>`, text: items.map((x) => `- ${inlineText(x)}`).join('\n') })
    items = []
  }
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const li = /^\s*[-•]\s+(.*)$/.exec(line)
    if (li) { items.push(li[1]); continue }
    flush()
    if (line.trim()) out.push({ html: `<p style="margin:0 0 12px">${inlineHtml(line.trim())}</p>`, text: inlineText(line.trim()) })
  }
  flush()
  return out
}

export function buildFormEmail(c: FormMailContext): BuiltEmail {
  const s = c.settings
  const contacts: string[] = []
  if (s?.contact_whatsapp) contacts.push(`WhatsApp: https://wa.me/${s.contact_whatsapp}`)
  if (s?.contact_email) contacts.push(`E-mail: ${s.contact_email}`)
  for (const d of s?.directors ?? []) contacts.push(`${d.name}: https://wa.me/${d.whatsapp}`)
  const footer: Section = raw(
    contacts.length ? `<hr style="border:none;border-top:1px solid #ddd;margin:16px 0"><p style="margin:0;font-size:13px;color:#555">${contacts.map((l) => escapeHtml(l)).join('<br>')}</p>` : '',
    contacts.length ? ['--', ...contacts].join('\n') : '')
  const approved = c.template === 'submission_approved'
  const waitlist = c.template === 'submission_waitlist'
  const fallback = waitlist ? `Recebemos a sua inscrição no ${c.org.name} e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a direção avisa se uma vaga abrir.` : approved ? `Sua inscrição no ${c.org.name} foi aprovada. Obrigado por se inscrever! A direção entrará em contato com os próximos passos.` : 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.'
  const body: Section[] = [
    p(`Olá${c.name ? `, ${c.name}` : ''}!`),
    ...richSections(c.message?.trim() || fallback),
    ...(contacts.length ? [p('Qualquer dúvida, fale com a gente pelos contatos abaixo.')] : []),
    footer,
  ]
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:16px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:20px"><h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(c.org.name)}</h2>${body.map((b) => b.html).join('')}</div></body></html>`
  const text = `${c.org.name}\n\n${body.map((b) => b.text).filter(Boolean).join('\n\n')}\n`
  return { subject: waitlist ? `Sua inscrição está na lista de espera — ${c.org.name}` : approved ? `Inscrição aprovada — ${c.org.name}` : `Sobre a sua inscrição — ${c.org.name}`, html, text }
}
