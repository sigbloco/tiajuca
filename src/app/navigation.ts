import { Home, Users, type LucideIcon } from 'lucide-react'
import type { PermissionKey } from '@/core/permissions'

export interface NavItem {
  to: string // relativo a /:orgSlug
  label: string
  icon: LucideIcon
  /** Se definido, o item só aparece para quem tem a permissão (a segurança real é o RLS). */
  permission?: PermissionKey
  /** Aparece na barra inferior do celular; o resto vai em "Mais". */
  primary?: boolean
}

// Fonte única da navegação. Novos módulos (fases 2+) entram aqui.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home, primary: true },
  { to: 'membros', label: 'Membros', icon: Users, permission: 'members.read', primary: true },
]
