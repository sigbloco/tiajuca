import { useQuery } from '@tanstack/react-query'
import { ClipboardList, LogIn, ShoppingBag } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Skeleton } from '@/components/ui/primitives'
import { DEFAULT_ORG_SLUG, supabase } from '@/core/supabase'
import { applyTheme, type OrgTheme } from '@/core/theme'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import { LINK_KINDS, hrefOf, youtubeId, type SiteLink, type SiteVideo } from './links'

export interface PublicSite {
  org: { slug: string; name: string; short_name: string; logo_path: string | null; theme: OrgTheme }
  site: {
    headline?: string | null; description?: string | null; photo_url?: string | null; links?: SiteLink[]; videos?: SiteVideo[]
    enrollment_label?: string; shop_label?: string; login_label?: string; show_shop?: boolean
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

const pill = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-center font-display text-lg font-bold shadow-card transition hover:-translate-y-0.5 hover:shadow-lg'

/** Página inicial pública do bloco, no estilo "link na bio": foto, descrição, redes, menu e vídeos. Tudo vem do banco. */
export function LandingPage() {
  const { data, isLoading, isError } = usePublicSite(DEFAULT_ORG_SLUG)
  useEffect(() => {
    if (!data) return
    applyTheme(data.org.theme, { cache: false })
    applyBrandToDocument({ name: data.org.name, logo_path: data.org.logo_path })
  }, [data])

  if (isLoading) return <main className="mx-auto max-w-md space-y-4 px-4 py-10"><Skeleton className="mx-auto h-32 w-32 rounded-full" /><Skeleton className="h-8" /><Skeleton className="h-24" /></main>
  if (isError || !data) {
    return <main className="mx-auto max-w-md px-4 py-16 text-center"><Link to="/entrar" className="font-semibold text-primary underline">Entrar</Link></main>
  }
  const { org, site } = data
  const slug = org.slug
  const links = (site.links ?? []).map((l) => ({ l, href: hrefOf(l) })).filter((x): x is { l: SiteLink; href: string } => !!x.href)
  const videos = (site.videos ?? []).map((v) => ({ v, id: youtubeId(v.url) })).filter((x): x is { v: SiteVideo; id: string } => !!x.id)
  const photo = site.photo_url || org.logo_path

  return (
    <main className="min-h-screen pb-16">
      <header className="bg-primary px-4 pb-20 pt-10 text-center text-primary-foreground">
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
          <Link to="/entrar" className={`${pill} bg-card text-foreground`}><LogIn className="h-5 w-5" /> {site.login_label || 'Área dos integrantes'}</Link>
        </nav>

        {videos.length > 0 && (
          <section className="space-y-4" aria-label="Vídeos">
            {videos.map(({ v, id }) => (
              <figure key={id} className="space-y-1.5">
                <div className="aspect-video overflow-hidden rounded-2xl bg-muted shadow-card">
                  <iframe className="h-full w-full" loading="lazy" src={`https://www.youtube-nocookie.com/embed/${id}`} title={v.title || 'Vídeo do YouTube'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                {v.title && <figcaption className="px-1 text-center text-sm font-semibold">{v.title}</figcaption>}
              </figure>
            ))}
          </section>
        )}

        <footer className="pt-4 text-center text-xs text-muted-foreground">{org.name}</footer>
      </div>
    </main>
  )
}
