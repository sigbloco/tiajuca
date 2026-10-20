import { Globe, LogOut, Menu, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { GlobalUnsavedGuard } from '@/components/shared/UnsavedGuard'
import { BackButton } from '@/components/shared/BackButton'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Button, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { HUBS, HUB_ORDER, NAV_ITEMS, type NavItem } from './navigation'
import { InactiveNotice } from '@/modules/members/Reactivation'
import { ViewAsBar } from './ViewAsBar'

interface MenuEntry { to: string; label: string; icon: LucideIcon; /** Caminhos (além de `to`) que deixam o item marcado. */ also?: string[]; admin?: boolean }

// Itens que ficam na barra inferior do celular; o resto vai em "Mais".
const MOBILE_PRIMARY = new Set(['', 'repertorio', 'eventos', 'organizacao', 'oficina'])

export function AppShell() {
  const { membership } = useOrganization()
  const { signOut } = useAuth()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const brandName = membership?.name
  const brandLogo = membership?.logo_path ?? null
  useEffect(() => { if (brandName) applyBrandToDocument({ name: brandName, logo_path: brandLogo }) }, [brandName, brandLogo])
  if (!membership) return null
  const base = `/${membership.slug}`
  const isTitular = membership.roles.includes('titular') // usuário institucional do bloco: não é uma pessoa, então não tem perfil
  const visible = (i: NavItem) => !(i.to === 'perfil' && isTitular) && (!i.permission || hasPermission(membership.permissions, i.permission, i.minScope ?? 'own'))

  // Menu: itens diretos, depois as áreas (Organização, Oficina) com as subpáginas dentro, e a administração no fim.
  const entries: MenuEntry[] = [
    ...NAV_ITEMS.filter((i) => !i.group && !i.admin && visible(i)).map((i) => ({ to: i.to, label: i.label, icon: i.icon, also: i.to === 'repertorio' ? ['drive'] : undefined })),
    ...HUB_ORDER.flatMap((hub) => {
      const children = NAV_ITEMS.filter((i) => i.group === hub && visible(i))
      return children.length === 0 ? [] : [{ to: hub, label: HUBS[hub].label, icon: HUBS[hub].icon, also: [...children.map((c) => c.to), 'lista-de-espera'] }]
    }),
    ...NAV_ITEMS.filter((i) => i.admin && visible(i)).map((i) => ({ to: i.to, label: i.label, icon: i.icon, admin: true })),
  ]
  const segs = pathname.slice(base.length).split('/').filter(Boolean)
  const item = NAV_ITEMS.find((i) => i.to === segs[0])
  const group = item?.group ?? (segs[0] === 'lista-de-espera' ? 'oficina' : undefined)
  const parent = segs.length === 0 ? null
    : segs[0] === 'drive' ? { to: `${base}/repertorio`, name: 'Repertório' }
    : segs.length > 1 ? { to: `${base}/${segs[0]}`, name: item?.label ?? 'a página anterior' }
    : group ? { to: `${base}/${group}`, name: HUBS[group].label }
    : { to: base, name: 'a página inicial' }
  const isActive = (e: MenuEntry) => {
    const rest = pathname.slice(base.length).replace(/^\//, '')
    const first = rest.split('/')[0]
    return e.to === '' ? rest === '' : first === e.to || (e.also ?? []).includes(first)
  }
  const link = (e: MenuEntry) =>
    cn('flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted', isActive(e) && 'bg-primary text-primary-foreground hover:bg-primary')
  const renderEntries = (list: MenuEntry[], onClick?: () => void) => list.map((e, idx) => (
    <div key={e.to || 'home'} className={cn(e.admin && !list[idx - 1]?.admin && 'mt-2 border-t border-border pt-3')}>
      <NavLink to={`${base}/${e.to}`} className={link(e)} onClick={onClick}>
        <e.icon className="h-5 w-5" /> {e.label}
      </NavLink>
    </div>
  ))
  const primary = entries.filter((e) => MOBILE_PRIMARY.has(e.to))
  const more = entries.filter((e) => !MOBILE_PRIMARY.has(e.to))

  return (
    <div className="min-h-screen bg-muted">
    <GlobalUnsavedGuard />
    <div className="mx-auto min-h-screen max-w-5xl border-x border-border bg-background shadow-card">
    <ViewAsBar />
    <div className="min-h-screen md:flex">
      {/* Desktop: sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-header p-4 text-header-foreground md:sticky md:top-0 md:flex md:max-h-screen">
        <div className="mb-6 flex items-center gap-3">
          <OrgLogo name={membership.name} logoPath={membership.logo_path} className="h-11 w-11 shrink-0" />
          <p className="font-display text-xl font-extrabold leading-tight text-primary">{membership.name}</p>
        </div>
        <nav className="flex-1 space-y-1">{renderEntries(entries)}</nav>
        <div className="border-t border-border pt-3">
          <Link to="/site" className="flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted"><Globe className="h-5 w-5" /> Ver o site</Link>
          <p className="mt-2 truncate px-1 font-semibold">{membership.display_name}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <div id="edit-slot" />
        <div className="page-body">
          <InactiveNotice />
          {parent && <BackButton to={parent.to} name={parent.name} />}
          <Outlet />
        </div>
      </main>

      {/* Mobile: barra inferior fixa + "Mais" */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-header text-header-foreground pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((e) => (
          <NavLink
            key={e.to || 'home'}
            to={`${base}/${e.to}`}
            className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground', isActive(e) && 'text-primary')}
          >
            <e.icon className="h-5 w-5" /> {e.label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground">
          <Menu className="h-5 w-5" /> Mais
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent title="Mais" description={membership.display_name}>
          <nav className="space-y-1">{renderEntries(more, () => setMoreOpen(false))}</nav>
          <Link to="/site" onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted"><Globe className="h-5 w-5" /> Ver o site</Link>
          <Button variant="outline" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
        </SheetContent>
      </Sheet>
    </div>
    </div>
    </div>
  )
}
