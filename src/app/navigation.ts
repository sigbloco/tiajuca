import {
  Award, Banknote, BarChart3, Building2, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, Drum, GraduationCap, History,
  Home, Music2, Palette, Settings, ShieldCheck, Store, Truck, UserRound, UserRoundCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import type { PermissionKey, PermissionScope } from '@/core/permissions'

/** Áreas do menu: cada uma é UM item à esquerda; as subpáginas ficam dentro dela (abas + página inicial com cartões). */
export type HubKey = 'organizacao' | 'oficina'
export const HUBS: Record<HubKey, { label: string; icon: LucideIcon; description: string }> = {
  organizacao: { label: 'Organização', icon: Building2, description: 'Ciclos, integrantes, dinheiro e fornecedores do bloco.' },
  oficina: { label: 'Oficina', icon: Drum, description: 'Alunos, presença, vagas e novas inscrições.' },
}
export const HUB_ORDER: HubKey[] = ['organizacao', 'oficina']

export interface NavItem {
  to: string // relativo a /:orgSlug
  label: string
  icon: LucideIcon
  /** Subpágina de uma área (Organização/Oficina). Sem `group`: item direto do menu. */
  group?: HubKey
  /** `true` nos itens do fim do menu (administração), separados por um traço. */
  admin?: boolean
  description?: string
  /** Se definido, o item só aparece para quem tem a permissão (a segurança real é o RLS). */
  permission?: PermissionKey
  /** Escopo mínimo para aparecer (padrão: próprio). */
  minScope?: PermissionScope
}

// Fonte única da navegação. A ordem aqui é a ordem no menu e nas abas.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home },
  { to: 'perfil', label: 'Meu perfil', icon: UserRound },
  { to: 'repertorio', label: 'Repertório', icon: Music2, permission: 'repertoire.read' },
  { to: 'eventos', label: 'Calendário', icon: CalendarDays, permission: 'events.read' },
  { to: 'gerenciar-loja', label: 'Loja', icon: Store, permission: 'shop.manage', description: 'Produtos, estoque e pedidos da loja.' },

  { to: 'ciclos', label: 'Ciclos', icon: CalendarRange, group: 'organizacao', permission: 'cycles.manage', description: 'Períodos do bloco (ex.: Carnaval 2026/27).' },
  { to: 'membros', label: 'Integrantes', icon: Users, group: 'organizacao', permission: 'members.read', description: 'Todas as pessoas, por naipe e instrumento.' },
  { to: 'mensalidades', label: 'Mensalidades', icon: Wallet, group: 'organizacao', permission: 'billing.read', description: 'Cobranças do mês e pagamentos.' },
  { to: 'bolsas', label: 'Bolsas', icon: Award, group: 'organizacao', permission: 'scholarships.manage', description: 'Quem tem bolsa e quanto isso pesa.' },
  { to: 'financeiro', label: 'Financeiro', icon: Banknote, group: 'organizacao', permission: 'finance.read', description: 'Receitas, despesas, distribuição e equipe.' },
  { to: 'fornecedores', label: 'Fornecedores', icon: Truck, group: 'organizacao', permission: 'suppliers.read', description: 'Contatos de som, tenda, banheiro e mais.' },

  { to: 'alunos', label: 'Alunos', icon: GraduationCap, group: 'oficina', permission: 'members.read', minScope: 'group', description: 'Quem está na oficina como aluno.' },
  { to: 'presenca', label: 'Presença', icon: ClipboardCheck, group: 'oficina', permission: 'attendance.record', description: 'Chamada dos ensaios e das aulas.' },
  { to: 'vagas', label: 'Vagas', icon: UserRoundCheck, group: 'oficina', permission: 'capacity.read', description: 'Vagas por instrumento e lista de espera.' },
  { to: 'inscricoes', label: 'Inscrições', icon: ClipboardList, group: 'oficina', permission: 'forms.manage', description: 'Formulários e novas inscrições para confirmar.' },
  { to: 'relatorios', label: 'Relatórios', icon: BarChart3, group: 'oficina', permission: 'attendance.read', minScope: 'group', description: 'Presença por pessoa, instrumento e mês.' },

  { to: 'interface', label: 'Interface', icon: Palette, admin: true, permission: 'org.manage' },
  { to: 'configuracoes', label: 'Configurações', icon: Settings, admin: true, permission: 'settings.manage' },
  { to: 'acesso', label: 'Acesso e papéis', icon: ShieldCheck, admin: true, permission: 'roles.manage' },
  { to: 'auditoria', label: 'Auditoria', icon: History, admin: true, permission: 'audit.read' },
]
