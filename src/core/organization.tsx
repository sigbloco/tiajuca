import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from './auth'
import type { GrantedPermission } from './permissions'
import { supabase } from './supabase'
import { applyTheme, type OrgTheme } from './theme'

export interface Membership {
  organization_id: string
  slug: string
  name: string
  short_name: string
  logo_path: string | null
  theme: OrgTheme
  timezone: string
  member_id: string
  display_name: string
  roles: string[]
  permissions: GrantedPermission[]
}

interface OrgContextValue {
  memberships: Membership[]
  membership: Membership | null
  loading: boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function useMemberships() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['memberships', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_memberships')
      if (error) throw error
      return (data ?? []) as Membership[]
    },
  })
}

/** Contexto da organização ativa (por slug da URL). Toda query do app usa `membership.organization_id`. */
export function OrganizationProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { data, isLoading } = useMemberships()
  const memberships = data ?? []
  const membership = memberships.find((m) => m.slug === slug) ?? null

  useEffect(() => {
    if (membership) applyTheme(membership.theme)
  }, [membership])

  const value = useMemo(() => ({ memberships, membership, loading: isLoading }), [memberships, membership, isLoading])
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrganization() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrganization deve ser usado dentro de OrganizationProvider')
  return ctx
}

/** Atalho: organização garantida (use dentro de rotas já protegidas). */
export function useOrgId(): string {
  const { membership } = useOrganization()
  if (!membership) throw new Error('Organização não carregada')
  return membership.organization_id
}
