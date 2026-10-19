import { supabase } from '@/core/supabase'
import { maskPhone } from '@/components/ui/masked-inputs'

/** Configurações da loja que o painel edita (tabela shop_settings). */
export interface DirectorSetting { name: string; whatsapp: string }
export interface ShopSettings {
  payment_methods: string[]
  infinitepay_handle: string | null
  public_site_url: string | null
  pix_key: string | null
  pix_beneficiary: string | null
  contact_whatsapp: string | null
  contact_email: string | null
  directors: DirectorSetting[]
  mail_from_name: string | null
  mail_from_email: string | null
}

export const EMPTY_SETTINGS: ShopSettings = {
  payment_methods: [], infinitepay_handle: null, public_site_url: null, pix_key: null, pix_beneficiary: null,
  contact_whatsapp: null, contact_email: null, directors: [], mail_from_name: null, mail_from_email: null,
}

const COLUMNS = 'payment_methods, infinitepay_handle, public_site_url, pix_key, pix_beneficiary, contact_whatsapp, contact_email, directors, mail_from_name, mail_from_email'

export async function getSettings(orgId: string): Promise<ShopSettings> {
  const { data, error } = await supabase.from('shop_settings').select(COLUMNS).eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return (data as ShopSettings | null) ?? EMPTY_SETTINGS
}

export async function saveSettings(orgId: string, s: ShopSettings) {
  const { error } = await supabase.from('shop_settings').upsert({ organization_id: orgId, ...s }, { onConflict: 'organization_id' })
  if (error) throw error
}

// ───────────── formulário ─────────────
export interface DirectorForm { name: string; phone: string }
export interface SettingsForm {
  pix: boolean; pixKey: string; pixBeneficiary: string
  infinitepay: boolean; handle: string; siteUrl: string
  whatsapp: string; email: string; directors: DirectorForm[]
  mailFromName: string; mailFromEmail: string
}

export const cleanHandle = (v: string) => v.trim().replace(/^\$/, '').trim()
export const cleanSiteUrl = (v: string) => v.trim().replace(/\/+$/, '')

/** '(21) 99999-8888' → '5521999998888'. Aceita também já com 55. Devolve null se não for um celular/fixo brasileiro válido. */
export function toWaDigits(input: string): string | null {
  const d = input.replace(/\D/g, '')
  if (/^[0-9]{10,11}$/.test(d)) return `55${d}`
  if (/^55[0-9]{10,11}$/.test(d)) return d
  return null
}

/** '5521999998888' → '(21) 99999-8888' (para mostrar no campo). */
export const fromWaDigits = (d: string | null): string => (d ? maskPhone(d.replace(/^55/, '')) : '')

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function fromSettings(s: ShopSettings, fallbackSiteUrl = ''): SettingsForm {
  return {
    pix: s.payment_methods.includes('pix'), pixKey: s.pix_key ?? '', pixBeneficiary: s.pix_beneficiary ?? '',
    infinitepay: s.payment_methods.includes('infinitepay'), handle: s.infinitepay_handle ?? '', siteUrl: s.public_site_url ?? fallbackSiteUrl,
    whatsapp: fromWaDigits(s.contact_whatsapp), email: s.contact_email ?? '',
    directors: s.directors.map((d) => ({ name: d.name, phone: fromWaDigits(d.whatsapp) })),
    mailFromName: s.mail_from_name ?? '', mailFromEmail: s.mail_from_email ?? '',
  }
}

/** Erros do formulário (lista vazia = pode salvar). Espelha as regras do banco. */
export function validateSettings(f: SettingsForm): string[] {
  const errors: string[] = []
  if (!f.pix && !f.infinitepay) errors.push('Deixe pelo menos uma forma de pagamento ativa.')
  if (f.pix) {
    if (f.pixKey.trim().length < 3) errors.push('Informe a chave Pix.')
    if (f.pixBeneficiary.trim().length < 2) errors.push('Informe o nome do favorecido do Pix.')
  }
  if (f.infinitepay) {
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(cleanHandle(f.handle))) errors.push('Informe a InfiniteTag (só letras, números, ponto, hífen ou sublinhado, sem o $).')
    if (!/^https?:\/\/[^\s/]+[^\s]*[^\s/]$/.test(cleanSiteUrl(f.siteUrl))) errors.push('Informe o endereço do site, começando com https://')
  } else if (f.siteUrl.trim() && !/^https?:\/\/[^\s/]+[^\s]*[^\s/]$/.test(cleanSiteUrl(f.siteUrl))) {
    errors.push('O endereço do site deve começar com https://')
  }
  if (!f.whatsapp.trim() && !f.email.trim()) errors.push('Informe pelo menos um contato da loja: WhatsApp ou e-mail.')
  if (f.whatsapp.trim() && !toWaDigits(f.whatsapp)) errors.push('WhatsApp da loja inválido. Use DDD + número.')
  if (f.email.trim() && !EMAIL.test(f.email.trim())) errors.push('E-mail de contato inválido.')
  for (const d of f.directors) {
    if (!d.name.trim()) errors.push('Toda pessoa da Direção precisa de um nome.')
    else if (!toWaDigits(d.phone)) errors.push(`WhatsApp inválido para ${d.name.trim()}. Use DDD + número.`)
  }
  if (f.mailFromEmail.trim() && !EMAIL.test(f.mailFromEmail.trim())) errors.push('E-mail do remetente inválido.')
  return errors
}

export function toSettings(f: SettingsForm): ShopSettings {
  const handle = cleanHandle(f.handle)
  const site = cleanSiteUrl(f.siteUrl)
  return {
    payment_methods: [f.pix && 'pix', f.infinitepay && 'infinitepay'].filter(Boolean) as string[],
    infinitepay_handle: handle || null,
    public_site_url: site || null,
    pix_key: f.pixKey.trim() || null,
    pix_beneficiary: f.pixBeneficiary.trim() || null,
    contact_whatsapp: toWaDigits(f.whatsapp),
    contact_email: f.email.trim() || null,
    directors: f.directors.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), whatsapp: toWaDigits(d.phone) as string })),
    mail_from_name: f.mailFromName.trim() || null,
    mail_from_email: f.mailFromEmail.trim() || null,
  }
}

/** O que falta preencher para a loja poder vender (aviso no topo do painel). */
export function missingSetup(s: ShopSettings): string[] {
  const out: string[] = []
  const methods = s.payment_methods.filter((m) => (m === 'pix' ? s.pix_key && s.pix_beneficiary : s.infinitepay_handle && s.public_site_url))
  if (methods.length === 0) out.push('Nenhuma forma de pagamento pronta (Pagamentos e contatos).')
  if (!s.contact_whatsapp && !s.contact_email) out.push('Contato da loja (WhatsApp ou e-mail).')
  if (!s.mail_from_email) out.push('Remetente dos e-mails.')
  return out
}
