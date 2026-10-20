import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Card, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { applyTheme } from '@/core/theme'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { useShopLabel } from '@/modules/site/useShopLabel'
import { BackButton } from '@/components/shared/BackButton'
import { buildShopTheme } from '../theme'
import { LoginDialog } from './LoginDialog'
import { StoreProvider, fetchStore, useStore } from './StoreContext'

/** Aviso de preço de integrante, logo abaixo do "Voltar": quem entrou vê que o preço dele está valendo; quem não entrou, o convite. */
function MemberNotice() {
  const { store, isMember, setLoginOpen } = useStore()
  const { session } = useAuth()
  const hasDiscount = store.products.some((p) => p.member_discount_pct > 0)
  if (isMember) return <p role="status" className="mb-4 inline-block rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">Preço de integrante ativo</p>
  if (session || !hasDiscount) return null
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-2 border-secondary p-3 text-sm">
      <span>É integrante do bloco? Entre com a sua conta para ver os preços de integrante.</span>
      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setLoginOpen(true)}>Entrar</button>
    </Card>
  )
}

function Header() {
  const { store, cart, basePath } = useStore()
  const shopLabel = useShopLabel(store.org.slug)
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to={basePath} className="flex min-w-0 flex-1 items-center gap-2">
          <OrgLogo name={store.org.name} logoPath={store.org.logo_path} className="h-10 w-10 shrink-0" />
          <span className="min-w-0 text-balance font-display text-lg font-extrabold leading-tight">{shopLabel}</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-3 text-sm">
          <Link to={`${basePath}/consultar`} className="font-semibold text-primary hover:underline">Pedidos</Link>
          <Link to={`${basePath}/carrinho`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 hover:bg-muted" aria-label={`Carrinho, ${cart.itemCount} item(ns)`}>
            <ShoppingCart className="h-5 w-5" />
            {cart.itemCount > 0 && <span className="ml-1 font-bold">{cart.itemCount}</span>}
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Shell() {
  const { store, notices, dismissNotices, basePath } = useStore()
  const shopLabel = useShopLabel(store.org.slug)
  const { pathname } = useLocation()
  useEffect(() => {
    // Cores do bloco (Configurações → Site) + cores só da loja, se definidas em Loja → Configurações.
    applyTheme(buildShopTheme(store.org.theme, store.theme_override), { cache: false })
    applyBrandToDocument({ name: shopLabel, logo_path: store.org.logo_path })
  }, [store, shopLabel])
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LoginDialog />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {pathname.replace(/\/$/, '') === basePath ? <BackButton to="/site" name="a página inicial" /> : <BackButton to={basePath} name={shopLabel} />}
        <MemberNotice />
        {notices.length > 0 && (
          <Card role="status" className="mb-4 border-secondary p-3 text-sm">
            <ul className="list-disc space-y-1 pl-5">{notices.map((n) => <li key={n}>{n}</li>)}</ul>
            <button type="button" className="mt-2 font-semibold text-primary hover:underline" onClick={dismissNotices}>Entendi</button>
          </Card>
        )}
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-sm text-muted-foreground">
        <Link className="hover:underline" to={`${basePath}/privacidade`}>Aviso de privacidade</Link>
      </footer>
    </div>
  )
}

/** Moldura pública da loja: carrega vitrine + tema do bloco e provê o carrinho. Não exige login. */
export function ShopLayout() {
  const { orgSlug = '' } = useParams()
  const q = useQuery({ queryKey: ['shop', 'store', orgSlug], queryFn: () => fetchStore(orgSlug), staleTime: 15_000 })
  if (q.isLoading) return <div className="mx-auto max-w-5xl space-y-3 p-6"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
  if (q.isError) return <main className="mx-auto max-w-xl p-6"><Card className="p-6">Não foi possível carregar a loja agora. Tente novamente em instantes.</Card></main>
  if (!q.data) return <main className="mx-auto max-w-xl p-6"><Card className="p-6">Loja não encontrada.</Card></main>
  return (
    <StoreProvider store={q.data} basePath={`/${orgSlug}/loja`}>
      <Shell />
    </StoreProvider>
  )
}
