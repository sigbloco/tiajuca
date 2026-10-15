import { Award, Banknote, BarChart3, CalendarDays, History, Music2, CalendarRange, ClipboardCheck, Hourglass, Home, Settings, UserRound, UserRoundCheck, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { PermissionKey, PermissionScope } from '@/core/permissions'

export interface NavItem {
  to: string // relativo a /:orgSlug
  label: string
  icon: LucideIcon
  /** Se definido, o item só aparece para quem tem a permissão (a segurança real é o RLS). */
  permission?: PermissionKey
  /** Escopo mínimo para aparecer (padrão: próprio). */
  minScope?: PermissionScope
  /** Aparece na barra inferior do celular; o resto vai em "Mais". */
  primary?: boolean
}

// Fonte única da navegação. Novos módulos (fases 4+) entram aqui.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home, primary: true },
  { to: 'repertorio', label: 'Repertório', icon: Music2, permission: 'repertoire.read', primary: true },
  { to: 'eventos', label: 'Eventos', icon: CalendarDays, permission: 'events.read', primary: true },
  { to: 'presenca', label: 'Presença', icon: ClipboardCheck, permission: 'attendance.record', primary: true },
  { to: 'mensalidades', label: 'Mensalidades', icon: Wallet, permission: 'billing.read', primary: true },
  { to: 'membros', label: 'Membros', icon: Users, permission: 'members.read' },
  { to: 'bolsas', label: 'Bolsas', icon: Award, permission: 'scholarships.manage' },
  { to: 'relatorios', label: 'Relatórios', icon: BarChart3, permission: 'attendance.read', minScope: 'group' },
  { to: 'financeiro', label: 'Financeiro', icon: Banknote, permission: 'finance.read' },
  { to: 'vagas', label: 'Vagas', icon: UserRoundCheck, permission: 'capacity.read' },
  { to: 'lista-de-espera', label: 'Lista de espera', icon: Hourglass, permission: 'member_cycles.read' },
  { to: 'ciclos', label: 'Ciclos', icon: CalendarRange, permission: 'cycles.manage' },
  { to: 'configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
  { to: 'auditoria', label: 'Auditoria', icon: History, permission: 'audit.read' },
  { to: 'perfil', label: 'Meu perfil', icon: UserRound },
]
