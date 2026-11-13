import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { useProgressive } from '@/components/shared/LoadMore'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { Skeleton } from '@/components/ui/primitives'
import { supabase } from '@/core/supabase'
import { useAreaTheme } from '@/core/useAreaTheme'
import { areaOverrides } from '@/core/themeModel'
import { applyBrandToDocument } from '@/modules/auth/AuthLayout'
import type { OrgTheme } from '@/core/theme'
import { albumDate, type PublicAlbum } from './albums'
import { hrefOf, textOn } from './links'

interface PublicAlbums { org: { slug: string; name: string; logo_path: string | null; theme: OrgTheme }; label: string; albums: PublicAlbum[] }

/** Página pública de fotos: cartões com capa, data, título e "por @autor". Cada cartão abre o álbum no Google Fotos. */
export function AlbumsPage() {
  const { orgSlug = '' } = useParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-albums', orgSlug],
    enabled: Boolean(orgSlug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_albums', { p_slug: orgSlug })
      if (error) throw error
      return data as PublicAlbums | null
    },
  })
  useAreaTheme(data?.org.theme, 'site')
  useEffect(() => { if (data) applyBrandToDocument({ name: `${data.label} · ${data.org.name}`, logo_path: data.org.logo_path }) }, [data])
  // Filtro por ano: começa no ano atual (se não houver álbum nele, no ano mais recente); "Sem data" só aparece se houver álbum sem data.
  const all = data?.albums ?? []
  const years = [...new Set(all.map((a) => a.event_date?.slice(0, 4)).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a))
  // Álbum sem data não aparece na página pública.
  const options = years
  const [picked, setPicked] = useState<string | null>(null)
  const thisYear = String(new Date().getFullYear())
  const year = picked && options.includes(picked) ? picked : years.includes(thisYear) ? thisYear : options[0] ?? ''
  const shown = all.filter((a) => a.event_date?.startsWith(year))
  const prog = useProgressive(shown, 6, year)
  const heroColor = data ? areaOverrides(data.org.theme, 'site').header ?? null : null
  const heroText = heroColor ? areaOverrides(data!.org.theme, 'site').headerText ?? textOn(heroColor) : undefined

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Cabeçalho fixo, vermelho como o da página inicial: voltar, título e filtro por ano ficam sempre à vista. */}
      <header className={`sticky top-0 z-20 shadow-card ${heroColor ? '' : 'bg-primary text-primary-foreground'}`} style={heroColor ? { backgroundColor: heroColor, color: heroText } : undefined}>
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-3 pt-3">
          <Link to="/site" className="inline-flex min-h-9 items-center gap-2 font-semibold hover:underline"><ArrowLeft className="h-5 w-5" aria-hidden /> Voltar para a página inicial</Link>
          {data && (
            <div className="flex items-center gap-3">
              <OrgLogo name={data.org.name} logoPath={data.org.logo_path} className="h-10 w-10 shrink-0 ring-2 ring-secondary" />
              <h1 className="font-display text-2xl font-extrabold">{data.label}</h1>
            </div>
          )}
          {options.length > 1 && (
            <ButtonRow role="group" aria-label="Filtrar por ano">
              {options.map((y) => (
                <button key={y} type="button" aria-pressed={year === y} onClick={() => setPicked(y)}
                  className={`min-h-9 rounded-lg border-2 border-transparent px-3 py-1.5 text-sm font-bold ${year === y ? 'bg-secondary text-secondary-foreground' : 'bg-card text-foreground hover:bg-muted'}`}>{y}</button>
              ))}
            </ButtonRow>
          )}
        </div>
      </header>
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      {isLoading && <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
      {(isError || (!isLoading && !data)) && <p className="py-10 text-center text-muted-foreground">Não foi possível carregar as fotos agora.</p>}
      {data && (
        <>
          {shown.length === 0 && <p className="py-10 text-center text-muted-foreground">Ainda não há álbuns.</p>}
          <ul className="grid gap-4 sm:grid-cols-2">
            {prog.visible.map((a) => {
              const authors = (a.authors ?? []).map((u) => ({ u, href: hrefOf({ ...u, label: '' }) })).filter((x) => x.u.value?.trim())
              return (
                <li key={a.id} className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-card">
                  <a href={a.url} target="_blank" rel="noreferrer noopener" aria-label={`Abrir o álbum ${a.title}`} className="block">
                    {a.cover_url ? <img src={a.cover_url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div aria-hidden className="aspect-[4/3] w-full bg-muted" />}
                  </a>
                  <div className="space-y-0.5 p-3">
                    {a.event_date && <p className="text-sm text-muted-foreground">{albumDate(a.event_date)}</p>}
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="block font-display text-lg font-bold leading-tight hover:underline">{a.title}</a>
                    {authors.length > 0 && (
                      <p className="text-sm">por {authors.map(({ u, href }, i) => (
                        <span key={i}>{i > 0 && (i === authors.length - 1 ? ' e ' : ', ')}
                          {href
                            ? <a href={href} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary hover:underline">{u.kind === 'instagram' ? `@${u.value.trim().replace(/^@/, '')}` : u.value}</a>
                            : u.value}
                        </span>
                      ))}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-4">{prog.button}</div>
        </>
      )}
    </main>
    </div>
  )
}
