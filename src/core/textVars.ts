import { maskPhone } from '@/components/ui/masked-inputs'
import { formatCurrency } from '@/core/format'

/** Variáveis que dá para escrever nos textos dos formulários; o valor atual do bloco entra na hora de mostrar. */
export const TEXT_VARS: { key: string; help: string }[] = [
  { key: 'valor', help: 'contribuição mensal da categoria escolhida no formulário (muda quando a pessoa escolhe)' },
  { key: 'vencimento', help: 'dia do vencimento da contribuição' },
  { key: 'chave_pix', help: 'chave Pix do bloco' },
  { key: 'whatsapp', help: 'número do WhatsApp do bloco' },
  { key: 'whatsapp_link', help: 'link para conversar no WhatsApp (use em [texto]({whatsapp_link}))' },
  { key: 'email', help: 'e-mail de contato do bloco' },
]
export interface TextVars {
  whatsapp?: string | null; email?: string | null; chave_pix?: string | null; vencimento?: string | number | null
  /** Pergunta do formulário ligada à categoria, e o preço atual de cada categoria (id da categoria de Organização → valor). */
  valor_field?: string | null; prices?: Record<string, number> | null
  /** Preço atual de cada categoria ativa, para {valor:Nome da categoria}. */
  categories?: { name: string; key: string | null; price: number }[] | null
}
const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Troca {valor}, {vencimento}, {chave_pix}, {whatsapp}, {whatsapp_link} e {email} pelos valores; o que não tem valor fica como está. */
export function fillVars(text: string, vars: TextVars | null | undefined, answers?: Record<string, unknown>): string {
  if (!vars) return text
  const digits = (vars.whatsapp ?? '').replace(/[^0-9]/g, '')
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  // {valor}: depende da categoria que a pessoa escolheu na pergunta ligada à categoria.
  let valor: string | null = null
  if (vars.valor_field) {
    const chosen = answers?.[vars.valor_field]
    const price = typeof chosen === 'string' && chosen ? vars.prices?.[chosen] : undefined
    valor = !chosen ? '(escolha a categoria)' : price != null ? formatCurrency(price) : 'sem contribuição'
  }
  const values: Record<string, string | null> = {
    valor,
    whatsapp: national ? maskPhone(national) : null,
    whatsapp_link: digits ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}` : null,
    email: vars.email ?? null,
    chave_pix: vars.chave_pix ?? null,
    vencimento: vars.vencimento != null && vars.vencimento !== '' ? String(vars.vencimento) : null,
  }
  // {valor:Aluno}: o preço atual da categoria pelo nome (sem diferenciar maiúsculas e acentos) ou pela chave fixa (aluno, musico, senior...).
  const withCats = text.replace(/\{valor:([^}]+)\}/g, (m, name: string) => {
    const n = norm(name)
    const cat = vars.categories?.find((c) => norm(c.name) === n || (c.key && c.key === n))
    return cat ? formatCurrency(cat.price) : m
  })
  return withCats.replace(/\{(whatsapp_link|whatsapp|email|chave_pix|vencimento|valor)\}/g, (m, k: string) => values[k] ?? m)
}
