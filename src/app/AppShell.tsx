import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { NAV_ITEMS } from './navigation'

export function AppShell() {
  const { membership } = useOrganization()
  const { signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  if (!membership) return null
  const base = `/${membership.slug}`
  const items = NAV_ITEMS.filter((i) => !i.permission || hasPermission(membership.permissions, i.permission, 'own'))
  const primary = items.filter((i) => i.primary)
  const more = items.filter((i) => !i.primary)
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted', isActive && 'bg-primary text-primary-foreground hover:bg-primary')

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop: sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 md:flex">
        <p className="mb-6 font-display text-2xl font-extrabold text-primary">{membership.short_name}</p>
        <nav className="flex-1 space-y-1">
          {items.map((i) => (
            <NavLink key={i.to} end={i.to === ''} to={`${base}/${i.to}`} className={link}>
              <i.icon className="h-5 w-5" /> {i.label}
            </NavLink>
          ))}
        </nav>
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
          <nav className="space-y-1">
            {more.map((i) => (
              <NavLink key={i.to} to={`${base}/${i.to}`} className={link} onClick={() => setMoreOpen(false)}>
                <i.icon className="h-5 w-5" /> {i.label}
              </NavLink>
            ))}
          </nav>
          <Button variant="outline" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
