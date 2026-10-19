import { PENDING, parseShopConfig, type ShopConfig } from './schema'

/**
 * Configuração da loja do bloco. É o ÚNICO lugar com dados específicos da loja (chave Pix, contatos, remetente, prazos).
 * Nada disso fica escrito em componentes. Segredos (InfinitePay, SMTP) ficam nos secrets das Edge Functions, nunca aqui.
 */
const raw = {
  orgSlug: 'tiajuca',
  reservationHours: 48,
  paymentMethods: ['pix', 'infinitepay'],
  pix: { key: PENDING, beneficiary: 'Cordão da Tia Juca' },
  contact: { whatsapp: PENDING, email: PENDING },
  mail: { fromName: 'Cordão da Tia Juca', fromEmail: PENDING },
}

let cached: ShopConfig | undefined

/** Único ponto de leitura da configuração (valida na primeira chamada). */
export function getShopConfig(): ShopConfig {
  return (cached ??= parseShopConfig(raw))
}
