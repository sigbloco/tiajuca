import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/primitives'
import { DEFAULT_ORG_SLUG, supabase } from '@/core/supabase'
import { applyTheme, type OrgTheme } from '@/core/theme'

interface PublicOrg {
  name: string
  short_name: string
  logo_path: string | null
  theme: OrgTheme
}

/** Identidade pública da organização (telas de login), vinda do banco — nada hardcoded. */
export function usePublicOrg() {
  return useQuery({
    queryKey: ['public-org', DEFAULT_ORG_SLUG],
    enabled: Boolean(DEFAULT_ORG_SLUG),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_org', { p_slug: DEFAULT_ORG_SLUG })
      if (error) throw error
      const org = data as PublicOrg | null
      if (org) applyTheme(org.theme)
      return org
    },
  })
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { data: org } = usePublicOrg()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="font-display text-3xl font-extrabold text-primary">{org?.name ?? 'SIGBloco'}</p>
        <p className="text-muted-foreground">Gestão de blocos e cordões</p>
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1">{title}</h1>
        {subtitle && <p className="mb-4 text-muted-foreground">{subtitle}</p>}
        {children}
      </Card>
    </main>
  )
}
