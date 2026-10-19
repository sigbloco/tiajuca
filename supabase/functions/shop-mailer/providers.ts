// Loja · camada de envio de e-mail. A lógica de pedidos só enfileira avisos; QUEM envia é trocável por configuração, sem mexer em pedidos.
// Provedores: 'smtp' (Gmail do bloco, hoje), 'resend' (API), 'log' (desenvolvimento: só registra, não envia).
// Funções PURAS aqui (escolha do provedor, remetente, corpo do Resend); o SMTP em si fica no index.ts (depende do Deno).

export type ProviderName = 'smtp' | 'resend' | 'log'
export interface Env { get(key: string): string | undefined }

export interface OutgoingMail {
  to: string; subject: string; html: string; text: string
  fromName: string; fromEmail: string; replyTo: string | null
}

/** MAIL_PROVIDER manda; sem ele, usa o que tiver credenciais (SMTP primeiro). Sem credenciais → null (a fila espera). */
export function pickProvider(env: Env): ProviderName | null {
  const forced = env.get('MAIL_PROVIDER')?.trim().toLowerCase()
  if (forced === 'log') return 'log'
  if (forced === 'smtp') return env.get('SMTP_USER') && env.get('SMTP_PASS') ? 'smtp' : null
  if (forced === 'resend') return env.get('RESEND_API_KEY') ? 'resend' : null
  if (env.get('SMTP_USER') && env.get('SMTP_PASS')) return 'smtp'
  if (env.get('RESEND_API_KEY')) return 'resend'
  return null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Remetente. No Gmail o "De" precisa ser a própria conta que autentica (ou um alias verificado): usamos SMTP_USER.
 * No Resend o domínio do remetente precisa estar verificado lá: usamos o e-mail configurado no painel.
 */
export function resolveSender(provider: ProviderName, settings: { mail_from_name: string | null; mail_from_email: string | null; contact_email: string | null } | null, orgName: string, env: Env) {
  const fromName = settings?.mail_from_name?.trim() || orgName
  const configured = settings?.mail_from_email?.trim() ?? ''
  const fromEmail = provider === 'smtp' ? (env.get('SMTP_USER') ?? configured)
    : provider === 'resend' ? configured
    : (configured || 'loja@exemplo.invalid')
  const reply = settings?.contact_email?.trim() || configured
  return { fromName, fromEmail, replyTo: EMAIL.test(reply) ? reply : null, valid: EMAIL.test(fromEmail) }
}

/** Cabeçalho "De" seguro: sem quebra de linha nem aspas soltas no nome. */
export const formatFrom = (name: string, email: string): string => `"${name.replace(/["\r\n]/g, '').trim()}" <${email}>`

export function resendBody(m: OutgoingMail) {
  return {
    from: formatFrom(m.fromName, m.fromEmail), to: [m.to], subject: m.subject, html: m.html, text: m.text,
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
  }
}

export async function sendViaResend(m: OutgoingMail, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(resendBody(m)),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Resend respondeu ${res.status}`)
}
