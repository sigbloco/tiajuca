import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useOrganization } from './organization'

// Espelha o catálogo `permissions` do banco. O BANCO decide (RLS); aqui só controlamos a interface.
export type PermissionKey =
  | 'org.manage' | 'settings.manage' | 'roles.manage' | 'backups.manage'
  | 'members.read' | 'members.manage' | 'members.sensitive.read' | 'members.sensitive.manage'
  | 'audit.read' | 'structure.manage' | 'cycles.manage'
  | 'member_cycles.read' | 'member_cycles.manage' | 'capacity.read' | 'capacity.manage'
  | 'events.read' | 'events.manage' | 'checklists.manage' | 'attendance.read' | 'attendance.record'
  | 'billing.read' | 'billing.manage' | 'scholarships.manage'
  | 'finance.read' | 'finance.manage' | 'staff_payments.read' | 'staff_payments.manage' | 'pix.manage'
  | 'repertoire.read' | 'repertoire.manage' | 'forms.manage' | 'suppliers.read' | 'suppliers.manage' | 'drive.read' | 'drive.manage' | 'shop.manage'

export type PermissionScope = 'own' | 'group' | 'org'
const RANK: Record<PermissionScope, number> = { own: 1, group: 2, org: 3 }

export interface GrantedPermission {
  key: PermissionKey
  scope: PermissionScope
}

/** Única função de decisão de permissão no front. Escopo mínimo padrão: organização. */
export function hasPermission(
  granted: GrantedPermission[],
  key: PermissionKey,
  minScope: PermissionScope = 'org',
): boolean {
  const g = granted.find((p) => p.key === key)
  return g ? RANK[g.scope] >= RANK[minScope] : false
}

export function usePermission(key: PermissionKey, minScope: PermissionScope = 'org'): boolean {
  const { membership } = useOrganization()
  return membership ? hasPermission(membership.permissions, key, minScope) : false
}

export function Can({
  permission,
  scope = 'org',
  children,
  fallback = null,
}: {
  permission: PermissionKey
  scope?: PermissionScope
  children: ReactNode
  fallback?: ReactNode
}) {
  return usePermission(permission, scope) ? <>{children}</> : <>{fallback}</>
}

/** Direção e Titular: os únicos que veem as páginas de Configurações. */
export function useIsDirection(): boolean {
  const { membership } = useOrganization()
  const roles = membership?.roles ?? []
  return roles.includes('direcao') || roles.includes('titular')
}

/** Guarda de rota: quem não é direção nem Titular volta ao início. */
export function DirectionOnly({ children }: { children: ReactNode }) {
  const { membership } = useOrganization()
  const ok = useIsDirection()
  if (!membership) return null
  return ok ? <>{children}</> : <Navigate to={`/${membership.slug}`} replace />
}
