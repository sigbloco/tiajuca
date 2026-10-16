import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { hasPermission, type GrantedPermission } from './permissions'
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
  /** Inativo no ciclo atual: o servidor já devolve sem papéis e bloqueia os dados. */
  inactive?: boolean
}

/** Pessoa que a Direção está "visualizando como". Só muda o que a INTERFACE mostra: o banco continua respondendo ao usuário real. */
export interface ViewAsTarget { member_id: string; display_name: string }

interface OrgContextValue {
  memberships: Membership[]
  /** Acesso efetivo: o real, ou o simulado enquanto "visualizar como" estiver ativo. */
  membership: Membership | null
  loading: boolean
  /** Acesso real do usuário logado (nunca simulado). */
  realMembership: Membership | null
  viewAs: ViewAsTarget | null
  /** true enquanto as permissões da pessoa escolhida ainda estão sendo carregadas. */
  viewAsLoading: boolean
  setViewAs: (t: ViewAsTarget | null) => void
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

const storageKey = (slug: string) => `sigbloco.viewAs.${slug}`
function readStored(slug: string): ViewAsTarget | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug))
    return raw ? (JSON.parse(raw) as ViewAsTarget) : null
  } catch { return null }
}

interface TargetAccess { roles: string[]; permissions: GrantedPermission[] }
type Scope = 'own' | 'group' | 'org'
const SCOPE_RANK: Record<Scope, number> = { own: 1, group: 2, org: 3 }

/** Papéis e permissões de outra pessoa (leitura permitida a quem gerencia papéis). */
async function loadTargetAccess(memberId: string): Promise<TargetAccess> {
  const { data, error } = await supabase
    .from('member_access_roles')
    .select('access_roles(key, rank, role_permissions(permission_key, scope))')
    .eq('member_id', memberId)
    .is('revoked_at', null)
  if (error) throw error
  interface RoleRow { key: string; rank: number; role_permissions: { permission_key: string; scope: Scope }[] }
  const rows = ((data ?? []) as unknown as { access_roles: RoleRow | null }[]).map((r) => r.access_roles).filter((r): r is RoleRow => !!r)
  const best = new Map<string, Scope>()
  for (const r of rows) {
    for (const p of r.role_permissions) {
      const cur = best.get(p.permission_key)
      if (!cur || SCOPE_RANK[p.scope] > SCOPE_RANK[cur]) best.set(p.permission_key, p.scope)
    }
  }
  return {
    roles: [...rows].sort((a, b) => b.rank - a.rank).map((r) => r.key),
    permissions: [...best].map(([key, scope]) => ({ key: key as GrantedPermission['key'], scope })),
  }
}

/** Contexto da organização ativa (por slug da URL). Toda query do app usa `membership.organization_id`. */
export function OrganizationProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { data, isLoading } = useMemberships()
  const memberships = data ?? []
  const real = memberships.find((m) => m.slug === slug) ?? null
  const [viewAs, setViewAsState] = useState<ViewAsTarget | null>(() => readStored(slug))
  // Só quem gerencia papéis (Titular/Direção) pode simular; para qualquer outra pessoa o que estiver guardado é ignorado.
  const allowed = !!real && hasPermission(real.permissions, 'roles.manage')
  const target = allowed && viewAs && viewAs.member_id !== real?.member_id ? viewAs : null

  const access = useQuery({
    queryKey: ['view-as-access', real?.organization_id, target?.member_id],
    enabled: !!target,
    queryFn: () => loadTargetAccess(target!.member_id),
  })

  const setViewAs = useCallback((t: ViewAsTarget | null) => {
    setViewAsState(t)
    try {
      if (t) sessionStorage.setItem(storageKey(slug), JSON.stringify(t))
      else sessionStorage.removeItem(storageKey(slug))
    } catch { /* sem armazenamento: vale só nesta carga */ }
  }, [slug])

  const membership = useMemo<Membership | null>(() => {
    if (!real) return null
    if (!target || !access.data) return real
    return { ...real, member_id: target.member_id, display_name: target.display_name, roles: access.data.roles, permissions: access.data.permissions }
  }, [real, target, access.data])

  useEffect(() => {
    if (membership) applyTheme(membership.theme)
  }, [membership])

  const value = useMemo(() => ({
    memberships, membership, loading: isLoading, realMembership: real, viewAs: target, viewAsLoading: !!target && access.isLoading, setViewAs,
  }), [memberships, membership, isLoading, real, target, access.isLoading, setViewAs])
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
