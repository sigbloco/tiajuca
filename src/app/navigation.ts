import { CalendarRange, Hourglass, Home, Settings, UserRoundCheck, Users, type LucideIcon } from 'lucide-react'
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

// Fonte única da navegação. Novos módulos (fases 3+) entram aqui.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home, primary: true },
  { to: 'membros', label: 'Membros', icon: Users, permission: 'members.read', primary: true },
  { to: 'vagas', label: 'Vagas', icon: UserRoundCheck, permission: 'capacity.read' },
  { to: 'lista-de-espera', label: 'Lista de espera', icon: Hourglass, permission: 'member_cycles.read' },
  { to: 'ciclos', label: 'Ciclos', icon: CalendarRange, permission: 'cycles.manage' },
  { to: 'configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
]
