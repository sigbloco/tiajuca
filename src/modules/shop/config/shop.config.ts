import { parseShopConfig, type ShopConfig } from './schema'

/**
 * Configuração estática da loja do bloco. É o ÚNICO ponto de leitura (validado na primeira chamada).
 * Todo o resto é editável no painel da loja (Loja → Configurações) e fica no banco.
 */
const raw = {
  orgSlug: 'tiajuca',
}

let cached: ShopConfig | undefined

export function getShopConfig(): ShopConfig {
  return (cached ??= parseShopConfig(raw))
}
