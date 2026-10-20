import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, LogIn, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoginPopup } from '@/modules/auth/LoginPopup'
import { useMemberships } from '@/core/organization'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Skeleton } from '@/components/ui/primitives'
import { DEFAULT_ORG_SLUG, supabase } from '@/core/supabase'
import type { OrgTheme } from '@/core/theme'
import { areaOverrides } from '@/core/themeModel'
import { useAreaTheme } from '@/core/useAreaTheme'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { useAuth } from '@/core/auth'
import { LINK_KINDS, hrefOf, textOn, youtubeId, type SiteLink, type SiteVideo } from './links'

export interface PublicSite {
  org: { slug: string; name: string; short_name: string; logo_path: string | null; theme: OrgTheme }
  site: {
    headline?: string | null; description?: string | null; photo_url?: string | null; links?: SiteLink[]; videos?: SiteVideo[]
    enrollment_label?: string; shop_label?: string; login_label?: string; show_shop?: boolean; header_color?: string | null; page_color?: string | null
  }
  open_forms: { slug: string; title: string }[]
}

export function usePublicSite(slug: string) {
  return useQuery({
    queryKey: ['public-site', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_site', { p_slug: slug })
      if (error) throw error
      return data as PublicSite | null
    },
  })
}

const safeBack = (b: string | null) => (b && b.startsWith('/') && !b.startsWith('//') ? b : '/')
const pill = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-center font-display text-lg font-bold shadow-card transition hover:-translate-y-0.5 hover:shadow-lg'

/** Página inicial pública do bloco, no estilo "link na bio": foto, descrição, redes, menu e vídeos. Tudo vem do banco. */
export function LandingPage() {
  const { data, isLoading, isError } = usePublicSite(DEFAULT_ORG_SLUG)
  const { session } = useAuth()
  const [shown, setShown] = useState(3)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [loginOpen, setLoginOpen] = useState(params.has('entrar'))
  const closeLogin = (o: boolean) => { setLoginOpen(o); if (!o && params.has('entrar')) { params.delete('entrar'); params.delete('voltar'); setParams(params, { replace: true }) } }
  const { data: mine } = useMemberships()
  useEffect(() => {
    if (!data) return
    applyBrandToDocument({ name: data.org.name, logo_path: data.org.logo_path })
  }, [data])

  // Cores da página inicial: as gerais + as de Interface → Site. Ao sair, voltam as gerais.
  useAreaTheme(data?.org.theme, 'site')

  if (isLoading) return <main className="mx-auto max-w-md space-y-4 px-4 py-10"><Skeleton className="mx-auto h-32 w-32 rounded-full" /><Skeleton className="h-8" /><Skeleton className="h-24" /></main>
  if (isError || !data) {
    return <main className="mx-auto max-w-md px-4 py-16 text-center"><button type="button" onClick={() => setLoginOpen(true)} className="font-semibold text-primary underline">Entrar</button><LoginPopup open={loginOpen} onOpenChange={closeLogin} /></main>
  }
  const { org, site } = data
  const slug = org.slug
  const links = (site.links ?? []).map((l) => ({ l, href: hrefOf(l) })).filter((x): x is { l: SiteLink; href: string } => !!x.href)
  const videos = (site.videos ?? []).map((v) => ({ v, id: youtubeId(v.url) })).filter((x): x is { v: SiteVideo; id: string } => !!x.id)
  const photo = site.photo_url || org.logo_path
  // Fundo do topo: só a cor escolhida para o Site (sem ela, usa a cor principal).
  const heroColor = areaOverrides(org.theme, 'site').header ?? null

  return (
    <main className="min-h-screen bg-background pb-16 text-foreground">
      <header className={`px-4 pb-20 pt-10 text-center ${heroColor ? "" : "bg-primary text-primary-foreground"}`} style={heroColor ? { backgroundColor: heroColor, color: textOn(heroColor) } : undefined}>
        {session && mine?.length ? <Link to={`/${mine[0].slug}`} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-black/25 px-4 font-semibold text-white"><ArrowLeft className="h-5 w-5" aria-hidden /> Voltar ao sistema</Link> : null}
        <OrgLogo name={org.name} logoPath={photo} className="mx-auto h-36 w-36 object-cover ring-4 ring-secondary" />
        <h1 className="mt-4 font-display text-3xl font-extrabold">{site.headline || org.name}</h1>
      </header>

      <div className="-mt-12 mx-auto max-w-md space-y-5 px-4">
        {(site.description || links.length > 0) && (
          <section className="space-y-4 rounded-3xl bg-card p-5 text-center shadow-card">
            {site.description && <p className="whitespace-pre-wrap text-base leading-relaxed">{site.description}</p>}
            {links.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-3" aria-label="Redes sociais e contatos">
                {links.map(({ l, href }, i) => (
                  <li key={i}>
                    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener" title={l.label || LINK_KINDS[l.kind].label}
                      aria-label={l.label || LINK_KINDS[l.kind].label}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card transition hover:scale-105">
                      {LINK_KINDS[l.kind].icon('h-6 w-6')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <nav className="space-y-3" aria-label="Menu">
          {data.open_forms.map((f) => (
            <Link key={f.slug} to={`/f/${slug}/${f.slug}`} className={`${pill} bg-secondary text-secondary-foreground`}>
              <ClipboardList className="h-5 w-5" /> {data.open_forms.length === 1 ? (site.enrollment_label || f.title) : f.title}
            </Link>
          ))}
          {site.show_shop !== false && (
            <Link to={`/${slug}/loja`} className={`${pill} bg-card text-foreground`}><ShoppingBag className="h-5 w-5" /> {site.shop_label || 'Loja'}</Link>
          )}
          <button type="button" onClick={() => setLoginOpen(true)} className={`${pill} bg-card text-foreground`}><LogIn className="h-5 w-5" /> {site.login_label || 'Área dos integrantes'}</button>
        </nav>

        {videos.length > 0 && (
          <section className="space-y-4" aria-label="Vídeos">
            {videos.slice(0, shown).map(({ v, id }) => (
              <figure key={id} className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-card">
                <div className="aspect-video bg-muted">
                  <iframe className="h-full w-full" loading="lazy" src={`https://www.youtube-nocookie.com/embed/${id}`} title={v.title || 'Vídeo do YouTube'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                {v.title && <figcaption className="border-t-2 border-border px-3 py-2 text-center text-sm font-semibold">{v.title}</figcaption>}
              </figure>
            ))}
            {videos.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + 3)} className="min-h-11 w-full rounded-full border-2 border-border bg-card px-5 font-semibold shadow-card hover:bg-muted">Carregar mais…</button>
            )}
          </section>
        )}

        <footer className="pt-4 text-center text-xs text-muted-foreground">{org.name}</footer>
      </div>
      <LoginPopup open={loginOpen} onOpenChange={closeLogin} onSignedIn={() => navigate(safeBack(params.get('voltar')), { replace: true })} />
    </main>
  )
}
