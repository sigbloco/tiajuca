import { LogOut, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { NavLink, Outlet } from 'react-router-dom'
import { Button, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { NAV_GROUP_LABEL, NAV_GROUP_ORDER, NAV_ITEMS, type NavItem } from './navigation'
import { ViewAsBar } from './ViewAsBar'

export function AppShell() {
  const { membership } = useOrganization()
  const { signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const brandName = membership?.name
  const brandLogo = membership?.logo_path ?? null
  useEffect(() => { if (brandName) applyBrandToDocument({ name: brandName, logo_path: brandLogo }) }, [brandName, brandLogo])
  if (!membership) return null
  const base = `/${membership.slug}`
  const items = NAV_ITEMS.filter((i) => !i.permission || hasPermission(membership.permissions, i.permission, i.minScope ?? 'own'))
  const primary = items.filter((i) => i.primary)
  const groups = NAV_GROUP_ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length > 0)
  // Menu agrupado: título pequeno em "Organização" e "Oficina"; o grupo de administração só ganha um traço separador.
  const renderGroups = (onClick?: () => void) => groups.map(({ g, list }, idx) => (
    <div key={g ?? 'top'} className={cn('space-y-1', idx > 0 && 'pt-3')}>
      {g && NAV_GROUP_LABEL[g] && <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{NAV_GROUP_LABEL[g]}</p>}
      {g === 'admin' && <div className="mx-3 mb-2 border-t border-border" />}
      {list.map((i: NavItem) => (
        <NavLink key={i.to} end={i.to === ''} to={`${base}/${i.to}`} className={link} onClick={onClick}>
          <i.icon className="h-5 w-5" /> {i.label}
        </NavLink>
      ))}
    </div>
  ))
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted', isActive && 'bg-primary text-primary-foreground hover:bg-primary')

  return (
    <>
    <ViewAsBar />
    <div className="min-h-screen md:flex">
      {/* Desktop: sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4 md:sticky md:top-0 md:flex md:max-h-screen">
        <div className="mb-6 flex items-center gap-3">
          <OrgLogo name={membership.name} logoPath={membership.logo_path} className="h-11 w-11 shrink-0" />
          <p className="font-display text-xl font-extrabold leading-tight text-primary">{membership.name}</p>
        </div>
        <nav className="flex-1">{renderGroups()}</nav>
        <div className="border-t border-border pt-3">
          <p className="truncate px-1 font-semibold">{membership.display_name}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile: barra inferior fixa + "Mais" */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((i) => (
          <NavLink
            key={i.to}
            end={i.to === ''}
            to={`${base}/${i.to}`}
            className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground', isActive && 'text-primary')}
          >
            <i.icon className="h-5 w-5" /> {i.label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground">
          <Menu className="h-5 w-5" /> Mais
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent title="Mais" description={membership.display_name}>
          <nav>{renderGroups(() => setMoreOpen(false))}</nav>
          <Button variant="outline" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
        </SheetContent>
      </Sheet>
    </div>
    </>
  )
}
