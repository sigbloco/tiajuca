import { SOCIAL_NETWORKS, toNetwork, type Network } from '@/core/social'
import { useCatalog } from '@/modules/structure/CatalogEditor'

/** Redes da lista "Redes sociais" (ativas, na ordem). Sem a lista carregada, usa as redes de sempre. */
export function useSocialNetworks(): Network[] {
  const { data } = useCatalog('social_networks')
  const act = (data ?? []).filter((x) => x.is_active && x.url_template && x.key).map((x) => toNetwork({ key: x.key!, name: x.name, url_template: x.url_template! }))
  return act.length > 0 ? act : SOCIAL_NETWORKS
}
