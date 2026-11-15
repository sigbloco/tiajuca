import { maskPhone } from '@/components/ui/masked-inputs'

/** Variáveis que dá para escrever nos textos dos formulários; o valor atual do bloco entra na hora de mostrar. */
export const TEXT_VARS: { key: string; help: string }[] = [
  { key: 'whatsapp', help: 'número do WhatsApp do bloco' },
  { key: 'whatsapp_link', help: 'link para conversar no WhatsApp (use em [texto]({whatsapp_link}))' },
  { key: 'email', help: 'e-mail de contato do bloco' },
  { key: 'chave_pix', help: 'chave Pix do bloco' },
  { key: 'vencimento', help: 'dia do vencimento da contribuição' },
]
export interface TextVars { whatsapp?: string | null; email?: string | null; chave_pix?: string | null; vencimento?: string | number | null }

/** Troca {whatsapp}, {whatsapp_link}, {email}, {chave_pix} e {vencimento} pelos valores; o que não tem valor fica como está. */
export function fillVars(text: string, vars: TextVars | null | undefined): string {
  if (!vars) return text
  const digits = (vars.whatsapp ?? '').replace(/[^0-9]/g, '')
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  const values: Record<string, string | null> = {
    whatsapp: national ? maskPhone(national) : null,
    whatsapp_link: digits ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}` : null,
    email: vars.email ?? null,
    chave_pix: vars.chave_pix ?? null,
    vencimento: vars.vencimento != null && vars.vencimento !== '' ? String(vars.vencimento) : null,
  }
  return text.replace(/\{(whatsapp_link|whatsapp|email|chave_pix|vencimento)\}/g, (m, k: string) => values[k] ?? m)
}
