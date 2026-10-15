import type { ReactNode } from 'react'
import { useOrganization } from './organization'

// Espelha o catálogo `permissions` do banco. O BANCO decide (RLS); aqui só controlamos a interface.
export type PermissionKey =
  | 'org.manage' | 'settings.manage' | 'roles.manage'
  | 'members.read' | 'members.manage' | 'members.sensitive.read' | 'members.sensitive.manage'
  | 'audit.read' | 'structure.manage' | 'cycles.manage'
  | 'member_cycles.read' | 'member_cycles.manage' | 'capacity.read' | 'capacity.manage'
  | 'events.read' | 'events.manage' | 'checklists.manage' | 'attendance.read' | 'attendance.record'
  | 'billing.read' | 'billing.manage' | 'scholarships.manage'
  | 'finance.read' | 'finance.manage' | 'staff_payments.read' | 'staff_payments.manage' | 'pix.manage'
  | 'repertoire.read' | 'repertoire.manage' | 'forms.manage' | 'suppliers.read' | 'suppliers.manage'

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
