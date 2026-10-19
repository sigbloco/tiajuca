import { usePublicSite } from './LandingPage'

/** Nome da loja definido pela Direção em Configurações > Site (padrão "Loja"). */
export function useShopLabel(slug: string): string {
  const { data } = usePublicSite(slug)
  return data?.site.shop_label?.trim() || 'Loja'
}
