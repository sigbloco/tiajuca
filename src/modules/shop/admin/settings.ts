import { cleanHandle, cleanSiteUrl } from './service'

export interface PaymentsForm { pix: boolean; infinitepay: boolean; handle: string; siteUrl: string }

/** Erros do formulário de pagamentos (lista vazia = pode salvar). Espelha as regras do banco. */
export function validatePayments(f: PaymentsForm): string[] {
  const errors: string[] = []
  if (!f.pix && !f.infinitepay) errors.push('Deixe pelo menos uma forma de pagamento ativa.')
  if (f.infinitepay) {
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(cleanHandle(f.handle))) errors.push('Informe a InfiniteTag (só letras, números, ponto, hífen ou sublinhado, sem o $).')
    if (!/^https?:\/\/[^\s/]+[^\s]*[^\s/]$/.test(cleanSiteUrl(f.siteUrl))) errors.push('Informe o endereço do site, começando com https://')
  }
  return errors
}

export function toSettings(f: PaymentsForm) {
  const handle = cleanHandle(f.handle)
  const site = cleanSiteUrl(f.siteUrl)
  return {
    payment_methods: [f.pix && 'pix', f.infinitepay && 'infinitepay'].filter(Boolean) as string[],
    infinitepay_handle: handle || null,
    public_site_url: site || null,
  }
}
