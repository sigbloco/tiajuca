import { OrgName } from '@/components/shared/OrgName'
import { LoadingScreen, useSplashHold } from '@/components/shared/LoadingScreen'
import { ArrowLeft, Construction, Globe, LogOut, Menu, Store, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCrumbOverride, useExtraCrumbs } from '@/core/breadcrumb'
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
import { applyBrandToDocument, cacheBrand } from '@/modules/auth/AuthLayout'
import { HUBS, NAV_ITEMS, canOpenPath, crumbsFor, hubVisible, navItemVisible, type CameFrom, type HubKey, type NavItem } from './navigation'
import { InactiveNotice } from '@/modules/members/Reactivation'
import { BulletTrail } from '@/components/shared/BulletTrail'
import { ViewAsBar } from './ViewAsBar'
import { PageReleaseBar } from './PageReleaseBar'
import { useMyReleases } from '@/modules/access/pageReleaseData'
import { pageKeyForPath } from '@/modules/access/pageReleases'
import { Lock, ShieldOff } from 'lucide-react'
import { useProfileGaps } from '@/modules/profile/profileGaps'

interface MenuEntry { to: string; label: string; icon: LucideIcon; /** Caminhos (além de `to`) que deixam o item marcado. */ also?: string[]; /** Traço separador acima do item. */ sep?: boolean; /** Página não liberada para o perfil: item apagado, sem link. */ off?: boolean }

// Itens que ficam na barra inferior do celular; o resto vai em "Mais".
const MOBILE_PRIMARY = new Set(['', 'eventos', 'oficina', 'repertorio'])

/** Quantas páginas o Voltar lembra. */
const BACK_LIMIT = 20

/** Página que a pessoa não tem permissão para abrir (URL digitada ou link antigo): aviso no lugar da tela vazia. */
function NoAccess({ base }: { base: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-10 text-center">
      <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="font-display text-2xl font-extrabold">Sem acesso a esta página</h1>
      <p className="text-muted-foreground">O seu perfil não tem permissão para abrir esta página. Se precisar dela, fale com a Direção.</p>
      <Link to={base} className="inline-block font-semibold text-primary hover:underline">Voltar ao início</Link>
    </div>
  )
}

function NotReleased({ base }: { base: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 py-10 text-center">
      <Lock className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="font-display text-2xl font-extrabold">Página ainda não liberada</h1>
      <p className="text-muted-foreground">Esta página ainda não foi liberada para o seu perfil. Em breve ela estará disponível.</p>
      <Link to={base} className="inline-block font-semibold text-primary hover:underline">Voltar ao início</Link>
    </div>
  )
}

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
  // Altura da barra fixa de cima (links, nome, Sair e a linha de liberação): o topo seguinte fica logo abaixo dela.
  const appbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = appbarRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--appbar-h', el.offsetHeight + 'px')
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  })
  // Altura da barra inferior do celular (0 no computador), para botões fixos na base ficarem acima dela.
  const bottomRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--bottombar-h', el.offsetHeight + 'px')
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  })
  const { membership } = useOrganization()
  const rel = useMyReleases()
  const splash = useSplashHold()
  const { signOut } = useAuth()
  const { pathname, search, state } = useLocation()
  const navigate = useNavigate()
  // Página de onde a pessoa veio dentro do app (só muda quando o caminho muda, não ao trocar de aba na mesma página).
  const lastPath = useRef(pathname)
  // O caminho completo da página (inclui a aba aberta) é guardado a cada tela; ao mudar de página, o da anterior vira o destino do Voltar.
  const extras = useExtraCrumbs()
  const crumbOverride = useCrumbOverride()
  const trailRender = useRef<string | null>(null)
  const trailCommitted = useRef<string | null>(null)
  const lastUrl = useRef(pathname + search)
  // Histórico do "Voltar": as últimas 20 páginas visitadas (cada Voltar tira uma da pilha, então dá para voltar vários passos).
  type Visit = { path: string; url: string; trail: string | null }
  const [stack, setStack] = useState<Visit[]>([])
  const popping = useRef(false)
  useEffect(() => {
    if (pathname !== lastPath.current) {
      if (popping.current) popping.current = false // foi um Voltar: a página que se deixou não volta para a pilha
      else if (/\/alunos$/.test(lastPath.current)) { /* Oficina → Alunos só redireciona para Integrantes: não conta como página visitada */ }
      else if (/\/presenca$/.test(lastPath.current) && !/[?&](dia|lista)=/.test(lastUrl.current)) { /* Oficina → Presença redireciona direto para a chamada: não conta como página visitada (o Voltar não pode cair de novo no redirecionamento) */ }
      else {
        const left: Visit = { path: lastPath.current, url: lastUrl.current, trail: trailCommitted.current }
        setStack((st) => [...(st[st.length - 1]?.path === left.path ? st.slice(0, -1) : st), left].slice(-BACK_LIMIT))
      }
      lastPath.current = pathname
    }
    lastUrl.current = pathname + search
    trailCommitted.current = trailRender.current
  })
  const previous = [...stack].reverse().find((v) => v.path !== pathname && v.path.startsWith(`/${membership?.slug}`)) ?? null
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
  }, [orgIdForCycles])
  useEffect(() => { if (brandName) applyBrandToDocument({ name: brandName, logo_path: brandLogo }) }, [brandName, brandLogo])
  useEffect(() => { if (membership) cacheBrand({ name: membership.name, short_name: membership.short_name, logo_path: membership.logo_path, theme: membership.theme }) }, [membership?.name, membership?.logo_path, membership?.theme])
  // Bolinha em "Meu perfil" enquanto houver campo em branco (o titular tem o perfil do bloco, sem esse aviso).
  const profileGaps = useProfileGaps(membership?.organization_id, membership?.member_id, !!membership && !membership.roles.includes('titular'))
  const hasGaps = (profileGaps?.length ?? 0) > 0
  if (!membership || !rel.ready || splash) return <LoadingScreen fillMs={3000} />
  // Nenhuma página liberada para este perfil (a liberação fica em Acesso e papéis): só o aviso, a loja, o site e o Sair.
  // O Titular que está "visualizando como" esse perfil continua com a barra para voltar; o inativo ainda pode pedir para voltar.
  if (!rel.all && !rel.anyPage) {
    return (
      <div className="min-h-screen bg-background">
        <ViewAsBar />
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 pt-12 text-center">
          <OrgLogo name={membership.name} logoPath={membership.logo_path} className="h-20 w-20" />
          <Construction className="h-10 w-10 text-primary" />
          <h1 className="font-display text-2xl font-extrabold">Nenhuma página liberada ainda</h1>
          <p className="text-muted-foreground">As páginas do sistema para o seu perfil ainda não foram liberadas. Em breve estarão disponíveis por aqui.</p>
          <div className="w-full text-left"><InactiveNotice /></div>
          <div className="flex w-full flex-col gap-2">
            <Link to={`/${membership.slug}/loja`}><Button className="w-full"><Store className="h-4 w-4" /> Ir para a loja</Button></Link>
            <Link to="/site"><Button variant="outline" className="w-full"><Globe className="h-4 w-4" /> Visitar site</Button></Link>
            <Button variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
          </div>
        </div>
      </div>
    )
  }
  const base = `/${membership.slug}`
  // Visitar site e Acessar loja: lado a lado com o Sair, sempre numa linha (só ícones quando a tela é estreita).
  const quickLinks = (onClick?: () => void) => [
    { to: "/site", label: "Visitar site", icon: Globe },
    { to: `${base}/loja`, label: "Acessar loja", icon: Store },
  ].map((l) => (
    <Link key={l.to} to={l.to} onClick={onClick} title={l.label} aria-label={l.label} className="min-w-0 flex-1 md:flex-none">
      <Button variant="outline" size="sm" className="w-full whitespace-nowrap px-2"><l.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{l.label}</span></Button>
    </Link>
  ))
  const isTitular = membership.roles.includes('titular') // o titular é o usuário do bloco: o perfil dele é o perfil do bloco (contatos usados pela Loja e pelo Site)
  const visible = (i: NavItem) => navItemVisible(i, membership.permissions)

  // Menu: itens diretos, depois as áreas (Organização, Oficina) com as subpáginas dentro, e a administração no fim.
  // Item não liberado para o perfil (Acesso e papéis → Liberação de páginas): continua no menu, só apagado e sem link.
  const off = (to: string) => !rel.released(pageKeyForPath(to) ?? to)
  const direct = (to: string): MenuEntry[] => NAV_ITEMS.filter((i) => i.to === to && visible(i)).map((i) => ({ to: i.to, label: i.to === 'perfil' && isTitular ? 'Perfil do bloco' : i.label, icon: i.icon, off: off(i.to) }))
  // O Financeiro fica embaixo de Calendário para todos, menos para quem administra as finanças (junto da Organização, onde sempre esteve).
  const bossView = hasPermission(membership.permissions, 'finance.read')
  const hubEntry = (hub: HubKey): MenuEntry[] => {
    if (!hubVisible(hub, membership.permissions)) return []
    const children = NAV_ITEMS.filter((i) => i.group === hub && visible(i))
    return [{ to: hub, label: HUBS[hub].label, icon: HUBS[hub].icon, also: [...children.map((c) => c.to)], off: off(hub) }]
  }
  const withSep = (list: MenuEntry[]): MenuEntry[] => list.map((e, i) => (i === 0 ? { ...e, sep: true } : e))
  const entries: MenuEntry[] = [
    ...direct(''), ...direct('perfil'), ...direct('eventos'), ...(bossView ? [] : hubEntry('financeiro')), ...hubEntry('oficina'), ...direct('membros'), ...direct('formularios'), ...direct('repertorio'), ...direct('naipes').map((e) => ({ ...e, also: ['vagas'] })),
    ...withSep([...hubEntry('organizacao'), ...(bossView ? hubEntry('financeiro') : [])]),
    ...withSep(NAV_ITEMS.filter((i) => i.admin && visible(i)).map((i) => ({ to: i.to, label: i.label, icon: i.icon, off: off(i.to) }))),
  ]
  const segs = pathname.slice(base.length).split('/').filter(Boolean)
  // Página que a pessoa tem permissão para abrir, mas ainda não foi liberada para o perfil dela: aviso no lugar da página.
  const blocked = rel.blockedFor(pathname.slice(base.length))
  // Página sem permissão (URL digitada): o mesmo critério do menu decide; o banco continua sendo quem protege os dados.
  const denied = !canOpenPath(pathname.slice(base.length), membership.permissions)

  const crumbs = crumbOverride ?? crumbsFor(segs, base)
  // "Voltar para Início • Loja": o caminho completo da página anterior, para não haver dúvida de onde se vai parar.
  const trailNow = [...crumbs.map((c) => c.label), ...extras.filter((e) => e.level === 0).map((e) => e.title)]
  trailRender.current = (trailNow.length ? trailNow : ['Início']).join(' • ')
  // Painéis abertos dentro da página (ficha do integrante, edição dos dados): o "voltar" nomeia o nível de fora, ex.: "Voltar para Integrantes" e, dentro da edição, "Voltar para Integrantes • Leonardo".
  const deepPanels = extras.filter((e) => e.level >= 1)
  const backTrail = (() => {
    if (!previous || previous.path === pathname || !previous.path.startsWith(base)) return null
    if (previous.trail) return previous.trail
    const labels = crumbsFor(previous.path.slice(base.length).split('/').filter(Boolean), base).map((c) => c.label)
    return (labels.length ? labels : ['Início']).join(' • ')
  })()
  const isActive = (e: MenuEntry) => {
    const rest = pathname.slice(base.length).replace(/^\//, '')
    const first = rest.split('/')[0]
    return e.to === '' ? rest === '' : first === e.to || (e.also ?? []).includes(first)
  }
  const link = (e: MenuEntry) =>
    cn('flex items-center gap-3 rounded-lg px-3 py-2 font-semibold hover:bg-muted', isActive(e) && 'bg-primary text-primary-foreground hover:bg-primary')
  const renderEntries = (list: MenuEntry[], onClick?: () => void) => list.map((e, idx) => (
    <div key={e.to || 'home'} className={cn(e.sep && idx > 0 && 'mt-2 border-t border-border pt-3')}>
      {e.off ? (
        <div aria-disabled="true" title="Ainda não liberado para o seu perfil" className="flex cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 py-2 font-semibold opacity-40">
          <e.icon className="h-5 w-5" /> {e.label}
        </div>
      ) : (
        <NavLink to={`${base}/${e.to}`} className={link(e)} onClick={onClick}>
          <e.icon className="h-5 w-5" /> {e.label}
          {e.to === 'perfil' && hasGaps && <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-warning ring-2 ring-background" role="img" aria-label="Perfil incompleto" title="Perfil incompleto" />}
        </NavLink>
      )}
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
          <p className="font-display text-xl font-extrabold leading-[1.05] text-primary"><OrgName name={membership.name} /></p>
        </div>
        <nav className="space-y-1">{renderEntries(entries)}</nav>
      </aside>

      <SelectedCycleProvider>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">
        {/* Site, nome e Sair: fixos no topo da página (no celular, também dentro do menu). */}
        <div ref={appbarRef} className="sticky top-[var(--viewas-h,0px)] z-40 -mx-4 -mt-4 mb-3 border-b border-border bg-background px-4 md:-mx-8 md:-mt-8 md:px-8">
          <div className="flex h-12 items-center gap-2">
            {quickLinks()}
            <p className="ml-auto hidden min-w-0 break-words text-right font-semibold md:block">{membership.display_name}</p>
            <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" aria-label="Sair" title="Sair" onClick={() => signOut()}><LogOut className="h-4 w-4 shrink-0" /><span className="hidden md:inline">Sair</span></Button>
          </div>
          {/* Titular marca para quem a página aberta está liberada; a Direção só vê. */}
          <PageReleaseBar base={base} />
        </div>
        {/* Topo fixo: caminho de navegação e ciclo acompanham a rolagem em todo o app. */}
        <div ref={topRef} className="sticky top-[calc(var(--viewas-h,0px)+var(--appbar-h,3rem))] z-30 -mx-4 -mt-3 mb-3 [&:not(:has(>:not(#edit-actions-slot:empty)))]:hidden border-b border-border bg-background px-4 pb-1.5 pt-1.5 md:top-[calc(var(--viewas-h,0px)+var(--appbar-h,3rem))] md:-mx-8 md:-mt-3 md:px-8 md:pt-3">
          <CycleBar base={base} />
          {pathname.replace(/\/+$/, '') !== base.replace(/\/+$/, '') && (
            <button type="button" className="mb-1 flex w-full items-start gap-1 text-left text-sm font-normal text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => {
                // Com painéis abertos na página (ficha, edição), "voltar" fecha o mais interno (e pergunta se há algo sem salvar).
                if (deepPanels.length > 0) { deepPanels[deepPanels.length - 1].close(); return }
                const close = document.querySelector<HTMLElement>('#edit-slot [data-sheet-close]')
                if (close) { close.click(); return }
                if (cameFrom) navigate(cameFrom.path)
                else if (previous) { setStack(stack.slice(0, stack.lastIndexOf(previous))); popping.current = true; navigate(previous.url) } // exatamente a página que o botão nomeia
                else navigate(base)
              }}>
              <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0" />
              <BulletTrail items={(() => { if (deepPanels.length > 0) { const base = trailNow.length ? trailNow : ['Início']; return [`Voltar para ${base[0]}`, ...base.slice(1), ...deepPanels.slice(0, -1).map((e) => e.title)] }; const t = cameFrom ? cameFrom.label : backTrail; if (!t) return ['Voltar']; const p = t.split(' • '); return [`Voltar para ${p[0]}`, ...p.slice(1)] })()} maxLines={1} />
            </button>
          )}
          <Breadcrumbs crumbs={crumbs} />
          <div id="edit-actions-slot" />
          </div>
        <div id="edit-slot" className="-mx-4 md:-mx-8" />
        <div className="page-body">
          <InactiveNotice />
          {denied ? <NoAccess base={base} /> : blocked ? <NotReleased base={base} /> : <Outlet />}
        </div>
      </main>
      </SelectedCycleProvider>

      {/* Mobile: barra inferior fixa + "Mais" */}
      <nav ref={bottomRef} className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-header text-header-foreground pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((e) => e.off ? (
          <div key={e.to || 'home'} aria-disabled="true" title="Ainda não liberado para o seu perfil" className="flex flex-1 cursor-not-allowed select-none flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground opacity-40">
            <e.icon className="h-5 w-5" /> {e.label}
          </div>
        ) : (
          <NavLink
            key={e.to || 'home'}
            to={`${base}/${e.to}`}
            className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground', isActive(e) && 'text-primary')}
          >
            <e.icon className="h-5 w-5" /> {e.label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold text-muted-foreground">
          <span className="relative"><Menu className="h-5 w-5" />{hasGaps && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-header" aria-hidden />}</span> Mais
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent drawer title="Menu" description={membership.display_name} headSlot={(
          <div className="flex gap-2">
            {quickLinks(() => setMoreOpen(false))}
            <Button variant="outline" size="sm" className="shrink-0" aria-label="Sair" title="Sair" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        )}>
          <nav className="space-y-1">{renderEntries(more, () => setMoreOpen(false))}</nav>
        </SheetContent>
      </Sheet>
    </div>
    </div>
    </div>
  )
}
