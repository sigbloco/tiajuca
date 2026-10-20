import { NavLink, Outlet } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'
import { FinancePage } from '@/modules/finance/FinancePage'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { HUBS, NAV_ITEMS, type HubKey, type NavItem } from './navigation'

/** Páginas do hub que a pessoa pode abrir (só o que o acesso dela permite). */
export function useHubItems(hub: HubKey): NavItem[] {
  const { membership } = useOrganization()
  if (!membership) return []
  return NAV_ITEMS.filter((i) => i.group === hub && (!i.permission || hasPermission(membership.permissions, i.permission, i.minScope ?? 'own')))
}

/** Moldura das páginas de um hub (Organização, Oficina). A navegação entre elas fica nos cartões da página inicial da área. */
export function HubLayout({ hub }: { hub: HubKey }) {
  void hub
  return <Outlet />
}

/** Cartões das subpáginas de um hub (título e descrição, 100% da largura no celular). */
export function HubCards({ hub }: { hub: HubKey }) {
  const { membership } = useOrganization()
  const items = useHubItems(hub)
  const base = `/${membership?.slug}`
  return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <NavLink key={i.to} to={`${base}/${i.to}`}>
            <Card className="flex h-full items-start gap-3 p-4 hover:bg-muted/50">
              <i.icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <p className="font-display text-lg font-bold">{i.label}</p>
                {i.description && <p className="text-muted-foreground">{i.description}</p>}
              </div>
            </Card>
          </NavLink>
        ))}
        {items.length === 0 && <Card className="p-6 text-muted-foreground">Você não tem acesso a nenhuma página desta área.</Card>}
      </div>
  )
}

/** Página inicial do hub: título e um cartão para cada subpágina. */
export function HubHome({ hub }: { hub: HubKey }) {
  return (
    <div className="space-y-4">
      <div>
        <h1>{HUBS[hub].label}</h1>
        <p className="text-muted-foreground">{HUBS[hub].description}</p>
      </div>
      <HubCards hub={hub} />
    </div>
  )
}

/** Financeiro: as subpáginas (mensalidades, bolsas) em cartões e, embaixo, receitas, despesas, distribuição, equipe e contribuições. */
export function FinanceHome() {
  return (
    <div className="space-y-6">
      <HubCards hub="financeiro" />
      <FinancePage />
    </div>
  )
}
