import {
  Award, Banknote, GraduationCap, BarChart3, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, FolderOpen, History, Home, Music2, Settings,
  ShieldCheck, Truck, UserRound, UserRoundCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import type { PermissionKey, PermissionScope } from '@/core/permissions'

/** Grupos do menu: o item sem grupo fica no topo; `admin` fica no fim, sem título. */
export type NavGroup = 'organizacao' | 'oficina' | 'admin'
export const NAV_GROUP_LABEL: Record<NavGroup, string | null> = { organizacao: 'Organização', oficina: 'Oficina', admin: null }
export const NAV_GROUP_ORDER: (NavGroup | undefined)[] = [undefined, 'organizacao', 'oficina', 'admin']

export interface NavItem {
  to: string // relativo a /:orgSlug
  label: string
  icon: LucideIcon
  group?: NavGroup
  /** Se definido, o item só aparece para quem tem a permissão (a segurança real é o RLS). */
  permission?: PermissionKey
  /** Escopo mínimo para aparecer (padrão: próprio). */
  minScope?: PermissionScope
  /** Aparece na barra inferior do celular; o resto vai em "Mais". */
  primary?: boolean
}

// Fonte única da navegação. A ordem aqui é a ordem no menu.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home, primary: true },
  { to: 'perfil', label: 'Meu perfil', icon: UserRound },
  { to: 'repertorio', label: 'Repertório', icon: Music2, permission: 'repertoire.read', primary: true },
  { to: 'drive', label: 'Pastas do Drive', icon: FolderOpen, permission: 'drive.read' },
  { to: 'eventos', label: 'Calendário', icon: CalendarDays, permission: 'events.read', primary: true },

  { to: 'ciclos', label: 'Ciclos', icon: CalendarRange, group: 'organizacao', permission: 'cycles.manage' },
  { to: 'membros', label: 'Integrantes', icon: Users, group: 'organizacao', permission: 'members.read' },
  { to: 'mensalidades', label: 'Mensalidades', icon: Wallet, group: 'organizacao', permission: 'billing.read', primary: true },
  { to: 'bolsas', label: 'Bolsas', icon: Award, group: 'organizacao', permission: 'scholarships.manage' },
  { to: 'financeiro', label: 'Financeiro', icon: Banknote, group: 'organizacao', permission: 'finance.read' },
  { to: 'fornecedores', label: 'Fornecedores', icon: Truck, group: 'organizacao', permission: 'suppliers.read' },

  { to: 'alunos', label: 'Alunos', icon: GraduationCap, group: 'oficina', permission: 'members.read', minScope: 'group' },
  { to: 'presenca', label: 'Presença', icon: ClipboardCheck, group: 'oficina', permission: 'attendance.record', primary: true },
  { to: 'vagas', label: 'Vagas', icon: UserRoundCheck, group: 'oficina', permission: 'capacity.read' },
  { to: 'inscricoes', label: 'Inscrições', icon: ClipboardList, group: 'oficina', permission: 'forms.manage' },
  { to: 'relatorios', label: 'Relatórios', icon: BarChart3, group: 'oficina', permission: 'attendance.read', minScope: 'group' },

  { to: 'configuracoes', label: 'Configurações', icon: Settings, group: 'admin', permission: 'settings.manage' },
  { to: 'acesso', label: 'Acesso e papéis', icon: ShieldCheck, group: 'admin', permission: 'roles.manage' },
  { to: 'auditoria', label: 'Auditoria', icon: History, group: 'admin', permission: 'audit.read' },
]
