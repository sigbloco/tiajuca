import { NavLink, Outlet } from 'react-router-dom'
import { Card, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { HUBS, NAV_ITEMS, type HubKey, type NavItem } from './navigation'

/** Páginas do hub que a pessoa pode abrir (só o que o acesso dela permite). */
export function useHubItems(hub: HubKey): NavItem[] {
  const { membership } = useOrganization()
  if (!membership) return []
  return NAV_ITEMS.filter((i) => i.group === hub && (!i.permission || hasPermission(membership.permissions, i.permission, i.minScope ?? 'own')))
}

/** Moldura das páginas de um hub (Organização, Oficina): abas com as subpáginas no topo e a página embaixo. */
export function HubLayout({ hub }: { hub: HubKey }) {
  const { membership } = useOrganization()
  const items = useHubItems(hub)
  const base = `/${membership?.slug}`
  return (
    <div className="space-y-4">
      <nav aria-label={HUBS[hub].label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <NavLink to={`${base}/${hub}`} end className={({ isActive }) => tab(isActive)}>{HUBS[hub].label}</NavLink>
        {items.map((i) => (
          <NavLink key={i.to} to={`${base}/${i.to}`} className={({ isActive }) => tab(isActive)}>
            <i.icon className="h-4 w-4" /> {i.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}

const tab = (active: boolean) =>
  cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 font-semibold', active ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')

/** Página inicial do hub: um cartão para cada subpágina. */
export function HubHome({ hub }: { hub: HubKey }) {
  const { membership } = useOrganization()
  const items = useHubItems(hub)
  const base = `/${membership?.slug}`
  return (
    <div className="space-y-4">
      <div>
        <h1>{HUBS[hub].label}</h1>
        <p className="text-muted-foreground">{HUBS[hub].description}</p>
      </div>
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
    </div>
  )
}
