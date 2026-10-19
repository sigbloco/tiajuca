import { supabase } from '@/core/supabase'
import { maskPhone } from '@/components/ui/masked-inputs'
import { isHexColor } from '../theme'

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
  /** Desconto de integrante (%) que já vem preenchido em produto novo. */
  default_member_discount_pct: number
  /** Aparência e textos da loja (opcionais). */
  theme_primary: string | null
  theme_secondary: string | null
  intro_text: string | null
  /** Horas que os itens ficam reservados aguardando o pagamento. */
  reservation_hours: number
  /** Anos de guarda dos dados do pedido (aviso de privacidade). */
  privacy_retention_years: number
}

export const EMPTY_SETTINGS: ShopSettings = {
  payment_methods: [], infinitepay_handle: null, public_site_url: null, pix_key: null, pix_beneficiary: null,
  contact_whatsapp: null, contact_email: null, directors: [], mail_from_name: null, mail_from_email: null, default_member_discount_pct: 0,
  theme_primary: null, theme_secondary: null, intro_text: null, reservation_hours: 48, privacy_retention_years: 5,
}

const COLUMNS = 'payment_methods, infinitepay_handle, public_site_url, pix_key, pix_beneficiary, contact_whatsapp, contact_email, directors, mail_from_name, mail_from_email, default_member_discount_pct, theme_primary, theme_secondary, intro_text, reservation_hours, privacy_retention_years'

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
  defaultDiscount: string
  themePrimary: string; themeSecondary: string; introText: string
  reservationHours: string; retentionYears: string
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

/** '10', '10,5' ou '10.5' → número; vazio vira 0; texto inválido vira null. */
export function parsePercent(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (t === '') return 0
  return /^[0-9]+(\.[0-9]{1,2})?$/.test(t) ? Number(t) : null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function fromSettings(s: ShopSettings, fallbackSiteUrl = ''): SettingsForm {
  return {
    pix: s.payment_methods.includes('pix'), pixKey: s.pix_key ?? '', pixBeneficiary: s.pix_beneficiary ?? '',
    infinitepay: s.payment_methods.includes('infinitepay'), handle: s.infinitepay_handle ?? '', siteUrl: s.public_site_url ?? fallbackSiteUrl,
    whatsapp: fromWaDigits(s.contact_whatsapp), email: s.contact_email ?? '',
    directors: s.directors.map((d) => ({ name: d.name, phone: fromWaDigits(d.whatsapp) })),
    mailFromName: s.mail_from_name ?? '', mailFromEmail: s.mail_from_email ?? '',
    defaultDiscount: String(s.default_member_discount_pct ?? 0).replace('.', ','),
    themePrimary: s.theme_primary ?? '', themeSecondary: s.theme_secondary ?? '', introText: s.intro_text ?? '',
    reservationHours: String(s.reservation_hours ?? 48), retentionYears: String(s.privacy_retention_years ?? 5),
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
  const pct = parsePercent(f.defaultDiscount)
  if (pct === null || pct < 0 || pct > 100) errors.push('O desconto padrão de integrante deve ficar entre 0% e 100%.')
  for (const [c, nome] of [[f.themePrimary, 'principal'], [f.themeSecondary, 'secundária']] as const) {
    if (c.trim() && !isHexColor(c)) errors.push(`A cor ${nome} é inválida. Use o formato #RRGGBB.`)
  }
  if (f.introText.length > 400) errors.push('O texto de abertura passa de 400 letras.')
  const hours = Number(f.reservationHours)
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) errors.push('O prazo de reserva deve ficar entre 1 e 720 horas.')
  const years = Number(f.retentionYears)
  if (!Number.isInteger(years) || years < 1 || years > 20) errors.push('O tempo de guarda dos dados deve ficar entre 1 e 20 anos.')
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
    default_member_discount_pct: parsePercent(f.defaultDiscount) ?? 0,
    theme_primary: f.themePrimary.trim().toUpperCase() || null,
    theme_secondary: f.themeSecondary.trim().toUpperCase() || null,
    intro_text: f.introText.trim() || null,
    reservation_hours: Number(f.reservationHours) || 48,
    privacy_retention_years: Number(f.retentionYears) || 5,
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
