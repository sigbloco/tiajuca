import { describe, expect, it } from 'vitest'
import { formatFrom, pickProvider, resendBody, resolveSender, sendViaResend, type Env, type OutgoingMail } from './providers'

const env = (o: Record<string, string>): Env => ({ get: (k) => o[k] })
const mail: OutgoingMail = { to: 'maria@ex.com', subject: 'Oi', html: '<p>x</p>', text: 'x', fromName: 'Tia "Juca"\nX', fromEmail: 'loja@ex.com', replyTo: 'contato@ex.com' }

describe('escolha do provedor', () => {
  it('sem credenciais não envia (a fila espera)', () => expect(pickProvider(env({}))).toBeNull())
  it('usa o que tem credenciais; SMTP tem prioridade', () => {
    expect(pickProvider(env({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }))).toBe('smtp')
    expect(pickProvider(env({ RESEND_API_KEY: 'k' }))).toBe('resend')
    expect(pickProvider(env({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x', RESEND_API_KEY: 'k' }))).toBe('smtp')
    expect(pickProvider(env({ SMTP_USER: 'a@gmail.com' }))).toBeNull()
  })
  it('MAIL_PROVIDER força a troca sem mexer em pedidos', () => {
    expect(pickProvider(env({ MAIL_PROVIDER: 'resend', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x', RESEND_API_KEY: 'k' }))).toBe('resend')
    expect(pickProvider(env({ MAIL_PROVIDER: 'resend', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' }))).toBeNull()
    expect(pickProvider(env({ MAIL_PROVIDER: 'log' }))).toBe('log')
  })
})

describe('remetente', () => {
  const s = { mail_from_name: 'Cordão da Tia Juca', mail_from_email: 'loja@tiajuca.com.br', contact_email: 'contato@tiajuca.com.br' }
  it('Gmail: o "De" é a conta que autentica', () => {
    const r = resolveSender('smtp', s, 'Bloco', env({ SMTP_USER: 'bloco@gmail.com' }))
    expect(r).toMatchObject({ fromName: 'Cordão da Tia Juca', fromEmail: 'bloco@gmail.com', replyTo: 'contato@tiajuca.com.br', valid: true })
  })
  it('Resend: usa o e-mail configurado no painel; sem ele, é inválido', () => {
    expect(resolveSender('resend', s, 'Bloco', env({})).fromEmail).toBe('loja@tiajuca.com.br')
    expect(resolveSender('resend', null, 'Bloco', env({})).valid).toBe(false)
  })
  it('nome cai para o do bloco; reply-to inválido some', () => {
    const r = resolveSender('resend', { mail_from_name: null, mail_from_email: 'loja@ex.com', contact_email: 'lixo' }, 'Cordão X', env({}))
    expect(r.fromName).toBe('Cordão X')
    expect(r.replyTo).toBeNull()
  })
  it('cabeçalho De sem aspas nem quebra de linha (anti-injeção)', () => {
    expect(formatFrom('Tia "Juca"\r\nBcc: x@y.z', 'a@b.co')).toBe('"Tia JucaBcc: x@y.z" <a@b.co>')
  })
})

describe('Resend', () => {
  it('monta o corpo da API', () => {
    expect(resendBody(mail)).toEqual({ from: '"Tia JucaX" <loja@ex.com>', to: ['maria@ex.com'], subject: 'Oi', html: '<p>x</p>', text: 'x', reply_to: 'contato@ex.com' })
    expect(resendBody({ ...mail, replyTo: null })).not.toHaveProperty('reply_to')
  })
  it('envia com a chave e falha com status não-OK', async () => {
    let seen: { url: string; auth: string | null } | null = null
    const okFetch = (async (url: string, init: RequestInit) => { seen = { url, auth: new Headers(init.headers).get('authorization') }; return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
    await sendViaResend(mail, 'KEY', okFetch)
    expect(seen).toEqual({ url: 'https://api.resend.com/emails', auth: 'Bearer KEY' })
    const bad = (async () => new Response('no', { status: 422 })) as unknown as typeof fetch
    await expect(sendViaResend(mail, 'KEY', bad)).rejects.toThrow(/422/)
  })
})
