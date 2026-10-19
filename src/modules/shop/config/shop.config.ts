import { parseShopConfig, type ShopConfig } from './schema'

/**
 * Configuração estática da loja do bloco. É o ÚNICO ponto de leitura (validado na primeira chamada).
 * Pix, contatos, Direção, formas de pagamento e remetente dos e-mails ficam no banco, editáveis no painel da loja.
 */
const raw = {
  orgSlug: 'tiajuca',
  reservationHours: 48,
}

let cached: ShopConfig | undefined

export function getShopConfig(): ShopConfig {
  return (cached ??= parseShopConfig(raw))
}
