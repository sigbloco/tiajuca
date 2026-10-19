// Edge Function: envia os e-mails da fila (shop_email_outbox). Chamada logo depois de uma mudança de status e, por segurança,
// a cada minuto por um agendamento no banco. Não recebe dados: só processa o que está na fila, então chamar de novo é inofensivo.
//
// Provedor (troca por configuração, sem mexer nos pedidos) — segredos no Supabase (Edge Functions → Secrets):
//   SMTP (Gmail):  SMTP_USER=conta@gmail.com   SMTP_PASS=<senha de app>   [SMTP_HOST=smtp.gmail.com  SMTP_PORT=465]
//   Resend:        RESEND_API_KEY=...          (e MAIL_PROVIDER=resend para forçar)
//   Teste:         MAIL_PROVIDER=log           (só registra no log, não envia)
// Sem credenciais, nada é enviado e os avisos continuam esperando na fila.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmail, type MailContext } from './templates.ts'
import { pickProvider, resolveSender, sendViaResend, formatFrom, type OutgoingMail } from './providers.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function sendViaSmtp(m: OutgoingMail) {
  const { default: nodemailer } = await import('npm:nodemailer@6.9.16')
  const port = Number(Deno.env.get('SMTP_PORT') ?? 465)
  const transport = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    connectionTimeout: 10_000, socketTimeout: 20_000,
  })
  await transport.sendMail({ from: formatFrom(m.fromName, m.fromEmail), to: m.to, replyTo: m.replyTo ?? undefined, subject: m.subject, html: m.html, text: m.text })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const provider = pickProvider({ get: (k) => Deno.env.get(k) })
  if (!provider) return json({ configured: false, sent: 0 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: batch, error } = await admin.rpc('shop_mail_claim', { p_limit: 20 })
  if (error) { console.error('shop_mail_claim', error.message); return json({ error: 'fila indisponível' }, 500) }

  let sent = 0
  let failed = 0
  for (const ctx of (batch ?? []) as MailContext[]) {
    try {
      const sender = resolveSender(provider, ctx.settings, ctx.org.name, { get: (k) => Deno.env.get(k) })
      if (!sender.valid) throw new Error('remetente não configurado (Loja → Pagamentos e contatos)')
      const built = buildEmail(ctx)
      const mail: OutgoingMail = { to: ctx.to_email, ...built, fromName: sender.fromName, fromEmail: sender.fromEmail, replyTo: sender.replyTo }
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
  return json({ configured: true, provider, sent, failed })
})
