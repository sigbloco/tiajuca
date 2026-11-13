import { ArrowLeft, Construction, Globe, LogOut, Menu, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GlobalUnsavedGuard } from '@/components/shared/UnsavedGuard'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { CycleBar, SelectedCycleProvider } from '@/modules/cycles/SelectedCycle'
import { Button, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'
import { useAuth } from '@/core/auth'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { HUBS, NAV_ITEMS, crumbsFor, type CameFrom, type HubKey, type NavItem } from './navigation'
import { InactiveNotice } from '@/modules/members/Reactivation'
import { ViewAsBar } from './ViewAsBar'

interface MenuEntry { to: string; label: string; icon: LucideIcon; /** Caminhos (além de `to`) que deixam o item marcado. */ also?: string[]; /** Traço separador acima do item. */ sep?: boolean }

// Itens que ficam na barra inferior do celular; o resto vai em "Mais".
const MOBILE_PRIMARY = new Set(['', 'eventos', 'oficina', 'repertorio'])

export function AppShell() {
  const topRef = useRef<HTMLDivElement>(null)
  // Altura do topo fixo, para outros elementos fixos da página (ex.: contadores da chamada) ficarem logo abaixo.
  useEffect(() => {
    const el = topRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--topbar-h', el.offsetHeight + 'px')
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  })
  const { membership, realMembership } = useOrganization()
  const { signOut } = useAuth()
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  const cameFrom = (state as { from?: CameFrom } | null)?.from
  const [moreOpen, setMoreOpen] = useState(false)
  const brandName = membership?.name
  const brandLogo = membership?.logo_path ?? null
  // O ciclo atual segue as datas: ao abrir o sistema, o banco confere qual ciclo está em andamento.
  const orgIdForCycles = membership?.organization_id
  const qcShell = useQueryClient()
  useEffect(() => {
    if (!orgIdForCycles) return
    void supabase.rpc('refresh_current_cycle', { p_org: orgIdForCycles }).then(() => qcShell.invalidateQueries({ queryKey: ['cycles'] }))
  }, [orgIdForCycles]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (brandName) applyBrandToDocument({ name: brandName, logo_path: brandLogo }) }, [brandName, brandLogo])
  if (!membership) return null
  // Área dos integrantes em construção: só Titular e Direção entram (vale pelo acesso real, não pela simulação).
  const realRoles = (realMembership ?? membership).roles
  if (!realRoles.includes('titular') && !realRoles.includes('direcao')) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <OrgLogo name={membership.name} logoPath={membership.logo_path} className="h-20 w-20" />
        <Construction className="h-10 w-10 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Área em construção</h1>
        <p className="max-w-sm text-muted-foreground">A área dos integrantes ainda está sendo construída. Em breve estará disponível por aqui.</p>
        <div className="flex gap-2">
          <Link to="/site"><Button variant="outline"><Globe className="h-4 w-4" /> Ver o site</Button></Link>
          <Button variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
        </div>
      </div>
    )
  }
  const base = `/${membership.slug}`
  const isTitular = membership.roles.includes('titular') // usuário institucional do bloco: não é uma pessoa, então não tem perfil
  const visible = (i: NavItem) => !(i.to === 'perfil' && isTitular) && (!i.permission || hasPermission(membership.permissions, i.permission, i.minScope ?? 'own'))

  // Menu: itens diretos, depois as áreas (Organização, Oficina) com as subpáginas dentro, e a administração no fim.
  const direct = (to: string): MenuEntry[] => NAV_ITEMS.filter((i) => i.to === to && visible(i)).map((i) => ({ to: i.to, label: i.label, icon: i.icon }))
  const hubEntry = (hub: HubKey): MenuEntry[] => {
    const children = NAV_ITEMS.filter((i) => i.group === hub && visible(i))
    const homeOk = HUBS[hub].homePermission ? hasPermission(membership.permissions, HUBS[hub].homePermission!, 'own') : false
    return children.length === 0 && !homeOk ? [] : [{ to: hub, label: HUBS[hub].label, icon: HUBS[hub].icon, also: [...children.map((c) => c.to), ...(hub === 'oficina' ? ['lista-de-espera'] : [])] }]
  }
  const withSep = (list: MenuEntry[]): MenuEntry[] => list.map((e, i) => (i === 0 ? { ...e, sep: true } : e))
  const entries: MenuEntry[] = [
    ...direct(''), ...direct('perfil'), ...direct('eventos'), ...hubEntry('oficina'), ...direct('membros'), ...direct('repertorio'), ...direct('naipes'),
    ...withSep([...hubEntry('organizacao'), ...hubEntry('financeiro')]),
    ...withSep(NAV_ITEMS.filter((i) => i.admin && visible(i)).map((i) => ({ to: i.to, label: i.label, icon: i.icon }))),
  ]
  const segs = pathname.slice(base.length).split('/').filter(Boolean)
  const crumbs = crumbsFor(segs, base)
  const isActive = (e: MenuEntry) => {
    const rest = pathname.slice(base.length).replace(/^\//, '')
    const first = rest.split('/')[0]
    return e.to === '' ? rest === '' : first === e.to || (e.also ?? []).includes(first)
  }
  const link = (e: MenuEntry) =>
    cn('flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted', isActive(e) && 'bg-primary text-primary-foreground hover:bg-primary')
  const renderEntries = (list: MenuEntry[], onClick?: () => void) => list.map((e, idx) => (
    <div key={e.to || 'home'} className={cn(e.sep && idx > 0 && 'mt-2 border-t border-border pt-3')}>
      <NavLink to={`${base}/${e.to}`} className={link(e)} onClick={onClick}>
        <e.icon className="h-5 w-5" /> {e.label}
      </NavLink>
    </div>
  ))
  const primary = [...MOBILE_PRIMARY].map((to) => entries.find((e) => e.to === to)).filter((e): e is MenuEntry => !!e)
  const more = entries // "Mais" lista tudo, inclusive os itens da barra inferior

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
          <p className="mt-2 break-words px-1 font-semibold">{membership.display_name}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <SelectedCycleProvider>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
        {/* Topo fixo: caminho de navegação e ciclo acompanham a rolagem em todo o app. */}
        <div ref={topRef} className="sticky top-[var(--viewas-h,0px)] z-30 -mx-4 -mt-4 mb-3 border-b border-border bg-background px-4 pb-1.5 pt-4 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
          {pathname.replace(/\/+$/, '') !== base.replace(/\/+$/, '') && (
            <button type="button" className="mb-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              onClick={() => {
                // Com um formulário aberto na página, "voltar" fecha o formulário (e pergunta se há algo sem salvar).
                const close = document.querySelector<HTMLElement>('#edit-slot [data-sheet-close]')
                if (close) { close.click(); return }
                if (cameFrom) navigate(cameFrom.path)
                else if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
                else navigate(base)
              }}>
              <ArrowLeft className="h-4 w-4" /> Voltar{cameFrom ? ` para ${cameFrom.label}` : ''}
            </button>
          )}
          <Breadcrumbs crumbs={crumbs} home={base} />
          <div id="edit-actions-slot" />
          <CycleBar base={base} />
          </div>
        <div id="edit-slot" className="-mx-4 md:-mx-8" />
        <div className="page-body">
          <InactiveNotice />
          <Outlet />
        </div>
      </main>
      </SelectedCycleProvider>

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
        <SheetContent drawer title="Mais" description={membership.display_name}>
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
