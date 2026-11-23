// Edge Function: envia os e-mails da fila (shop_email_outbox). Chamada logo depois de uma mudança de status: pelas outras funções da
// loja (chave de serviço) e pela tela de formulários (sessão de quem aprovou). Não recebe dados: só processa o que está na fila,
// então chamar de novo é inofensivo.
//
// Provedor (troca por configuração, sem mexer nos pedidos) — segredos no Supabase (Edge Functions → Secrets):
//   SMTP (Gmail):  SMTP_USER=conta@gmail.com   SMTP_PASS=<senha de app>   [SMTP_HOST=smtp.gmail.com  SMTP_PORT=465]
//   Resend:        RESEND_API_KEY=...          (e MAIL_PROVIDER=resend para forçar)
//   Teste:         MAIL_PROVIDER=log           (só registra no log, não envia)
// Sem credenciais, nada é enviado e os avisos continuam esperando na fila.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildEmail, buildFormEmail, pixCodeFor, PIX_QR_CID, type FormMailContext, type MailContext } from './templates.ts'
import { pickProvider, resolveSender, sendViaResend, formatFrom, toBase64, type InlineImage, type OutgoingMail } from './providers.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function sendViaSmtp(m: OutgoingMail) {
  const { default: nodemailer } = await import('npm:nodemailer@6.9.16')
  const port = Number(Deno.env.get('SMTP_PORT') ?? 465)
  const transport = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    connectionTimeout: 10_000, socketTimeout: 20_000,
  })
  await transport.sendMail({
    from: formatFrom(m.fromName, m.fromEmail), to: m.to, replyTo: m.replyTo ?? undefined, subject: m.subject, html: m.html, text: m.text,
    attachments: m.inline?.map((i) => ({ filename: i.filename, content: toBase64(i.content), encoding: 'base64', contentType: i.contentType, cid: i.cid, contentDisposition: 'inline' as const })),
  })
}

/** QR code do Pix como PNG embutido no e-mail. Se falhar, o e-mail segue só com o código "copia e cola". */
async function pixQrImage(code: string): Promise<InlineImage | null> {
  try {
    const { default: QRCode } = await import('npm:qrcode@1.5.4')
    const png: Uint8Array = await QRCode.toBuffer(code, { type: 'png', margin: 1, width: 360 })
    return { cid: PIX_QR_CID, filename: 'pix-qrcode.png', contentType: 'image/png', content: new Uint8Array(png) }
  } catch (e) {
    console.error('QR do Pix indisponível', (e as Error).message)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  // Só a chave de serviço (outras funções da loja) ou um usuário logado (tela de formulários). A chave pública sozinha não basta.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token || token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } }
    if (!data.user) return json({ error: 'Não autorizado.' }, 401)
  }

  const provider = pickProvider({ get: (k) => Deno.env.get(k) })
  if (!provider) return json({ configured: false, sent: 0 })
  const { data: batch, error } = await admin.rpc('shop_mail_claim', { p_limit: 20 })
  if (error) { console.error('shop_mail_claim', error.message); return json({ error: 'fila indisponível' }, 500) }

  let sent = 0
  let failed = 0
  for (const ctx of (batch ?? []) as MailContext[]) {
    try {
      const sender = resolveSender(provider, ctx.settings, ctx.org.name, { get: (k) => Deno.env.get(k) })
      if (!sender.valid) throw new Error('remetente não configurado (Loja → Pagamentos e contatos)')
      const pixCode = pixCodeFor(ctx)
      const qr = pixCode ? await pixQrImage(pixCode) : null
      const built = buildEmail(ctx, { qrCid: qr ? PIX_QR_CID : null })
      const mail: OutgoingMail = { to: ctx.to_email, ...built, fromName: sender.fromName, fromEmail: sender.fromEmail, replyTo: sender.replyTo, inline: qr ? [qr] : undefined }
      if (provider === 'smtp') await sendViaSmtp(mail)
      else if (provider === 'resend') await sendViaResend(mail, Deno.env.get('RESEND_API_KEY')!)
      else console.log('[mail:log]', ctx.template, ctx.order.code, '→', mail.to.replace(/^(.).*(@.*)$/, '$1***$2'), '|', mail.subject)
      await admin.rpc('shop_mail_done', { p_id: ctx.outbox_id, p_ok: true, p_error: null })
      sent++
    } catch (e) {
      failed++
      console.error('envio falhou', ctx.template, ctx.order.code, (e as Error).message)
      await admin.rpc('shop_mail_done', { p_id: ctx.outbox_id, p_ok: false, p_error: (e as Error).message })
    }
  }
  // Avisos dos formulários (inscrição aprovada): mesma fila de envio, mesmo remetente.
  const { data: fbatch, error: ferr } = await admin.rpc('form_mail_claim', { p_limit: 20 })
  if (ferr) console.error('form_mail_claim', ferr.message)
  for (const ctx of (fbatch ?? []) as FormMailContext[]) {
    try {
      const sender = resolveSender(provider, ctx.settings, ctx.org.name, { get: (k) => Deno.env.get(k) })
      if (!sender.valid) throw new Error('remetente não configurado (Loja → Pagamentos e contatos)')
      const built = buildFormEmail(ctx)
      const mail: OutgoingMail = { to: ctx.to_email, ...built, fromName: sender.fromName, fromEmail: sender.fromEmail, replyTo: sender.replyTo }
      if (provider === 'smtp') await sendViaSmtp(mail)
      else if (provider === 'resend') await sendViaResend(mail, Deno.env.get('RESEND_API_KEY')!)
      else console.log('[mail:log]', ctx.template, '→', mail.to.replace(/^(.).*(@.*)$/, '$1***$2'), '|', mail.subject)
      await admin.rpc('form_mail_done', { p_id: ctx.outbox_id, p_ok: true, p_error: null })
      sent++
    } catch (e) {
      failed++
      console.error('envio de formulário falhou', ctx.template, (e as Error).message)
      await admin.rpc('form_mail_done', { p_id: ctx.outbox_id, p_ok: false, p_error: (e as Error).message })
    }
  }
  return json({ configured: true, provider, sent, failed })
})
