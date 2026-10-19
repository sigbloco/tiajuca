import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Card, Skeleton } from '@/components/ui/primitives'
import { DEFAULT_ORG_SLUG, supabase } from '@/core/supabase'
import { applyTheme, type OrgTheme } from '@/core/theme'

interface PublicOrg {
  name: string
  short_name: string
  logo_path: string | null
  theme: OrgTheme
}

const BRAND_KEY = 'sigbloco:brand'
// Cache só de nome e logo (públicos) para a tela de login não piscar com texto genérico.
function readBrand(): PublicOrg | undefined {
  try {
    const raw = localStorage.getItem(BRAND_KEY)
    return raw ? (JSON.parse(raw) as PublicOrg) : undefined
  } catch { return undefined }
}

/** Troca o título da aba e o ícone pela identidade da organização. */
export function applyBrandToDocument(org: { name: string; logo_path: string | null }) {
  document.title = org.name
  if (!org.logo_path) return
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
  link.href = org.logo_path
}

/** Identidade pública da organização (telas de login), vinda do banco — nada hardcoded. */
export function usePublicOrg() {
  return useQuery({
    queryKey: ['public-org', DEFAULT_ORG_SLUG],
    enabled: Boolean(DEFAULT_ORG_SLUG),
    initialData: readBrand,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_org', { p_slug: DEFAULT_ORG_SLUG })
      if (error) throw error
      const org = data as PublicOrg | null
      if (org) {
        applyTheme(org.theme)
        try { localStorage.setItem(BRAND_KEY, JSON.stringify({ name: org.name, short_name: org.short_name, logo_path: org.logo_path, theme: org.theme })) } catch { /* ignorar */ }
      }
      return org
    },
  })
}

/** Telas de entrada: faixa na cor do bloco com a logo e o nome; o cartão do formulário sobe sobre ela. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { data: org } = usePublicOrg()
  useEffect(() => { if (org) applyBrandToDocument(org) }, [org])
  return (
    <main className="min-h-screen">
      <header className="bg-primary px-4 pb-16 pt-10 text-center text-primary-foreground">
        {org ? <OrgLogo name={org.name} logoPath={org.logo_path} className="mx-auto h-28 w-28 ring-4 ring-secondary" /> : <Skeleton className="mx-auto h-28 w-28 rounded-full" />}
        <p className="mt-3 min-h-9 font-display text-3xl font-extrabold">{org?.name}</p>
      </header>
      <div className="-mt-10 flex flex-col items-center px-4 pb-10">
        <Card className="w-full max-w-sm p-6">
          <h1 className="mb-1">{title}</h1>
          {subtitle && <p className="mb-4 text-muted-foreground">{subtitle}</p>}
          {children}
        </Card>
        <Link to="/site" className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary hover:underline"><ArrowLeft className="h-5 w-5" aria-hidden /> Voltar para a página inicial</Link>
      </div>
    </main>
  )
}
