import {
  Award, Banknote, BarChart3, Building2, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, Drum, FolderOpen, GraduationCap, History,
  Globe, Home, ListChecks, Music2, Palette, ShieldCheck, Store, Tags, Truck, UserRound, UserRoundCheck, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import type { PermissionKey, PermissionScope } from '@/core/permissions'

/** Áreas do menu: cada uma é UM item à esquerda; as subpáginas ficam dentro dela (página inicial com cartões). */
export type HubKey = 'oficina' | 'financeiro' | 'organizacao'
export const HUBS: Record<HubKey, { label: string; icon: LucideIcon; description: string; /** Quem tem esta permissão vê a área mesmo sem subpáginas (a página inicial dela tem conteúdo próprio). */ homePermission?: PermissionKey }> = {
  oficina: { label: 'Oficina', icon: Drum, description: 'Alunos, presença, vagas e novas inscrições.' },
  financeiro: { label: 'Financeiro', icon: Banknote, description: 'Receitas, despesas, mensalidades e bolsas.', homePermission: 'finance.read' },
  organizacao: { label: 'Organização', icon: Building2, description: 'Ciclos, fornecedores, checklists, funções e Google Drive.' },
}
export const HUB_ORDER: HubKey[] = ['oficina', 'financeiro', 'organizacao']

export interface NavItem {
  to: string // relativo a /:orgSlug
  label: string
  icon: LucideIcon
  /** Nome no caminho de navegação (breadcrumb), quando diferente do menu. */
  crumb?: string
  /** Subpágina de uma área (Oficina, Financeiro, Organização). Sem `group`: item direto do menu. */
  group?: HubKey
  /** `true` nos itens do fim do menu (administração), separados por um traço. */
  admin?: boolean
  description?: string
  /** Se definido, o item só aparece para quem tem a permissão (a segurança real é o RLS). */
  permission?: PermissionKey
  /** Escopo mínimo para aparecer (padrão: próprio). */
  minScope?: PermissionScope
}

// Fonte única da navegação. A ordem aqui é a ordem no menu e nos cartões.
export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Início', icon: Home },
  { to: 'perfil', label: 'Meu perfil', icon: UserRound },
  { to: 'naipes', label: 'Naipes', crumb: 'Naipes e instrumentos', icon: Drum, permission: 'structure.manage' },
  { to: 'membros', label: 'Integrantes', icon: Users, permission: 'members.read' },
  { to: 'repertorio', label: 'Repertório', icon: Music2, permission: 'repertoire.read' },
  { to: 'eventos', label: 'Calendário', icon: CalendarDays, permission: 'events.read' },

  { to: 'alunos', label: 'Alunos', icon: GraduationCap, group: 'oficina', permission: 'members.read', minScope: 'group', description: 'Quem está na oficina como aluno.' },
  { to: 'presenca', label: 'Presença', icon: ClipboardCheck, group: 'oficina', permission: 'attendance.record', description: 'Chamada dos ensaios e das aulas.' },
  { to: 'vagas', label: 'Vagas', icon: UserRoundCheck, group: 'oficina', permission: 'capacity.read', description: 'Vagas por instrumento e lista de espera.' },
  { to: 'inscricoes', label: 'Inscrições', icon: ClipboardList, group: 'oficina', permission: 'forms.manage', description: 'Formulários e novas inscrições para confirmar.' },
  { to: 'relatorios', label: 'Relatórios', icon: BarChart3, group: 'oficina', permission: 'attendance.read', minScope: 'group', description: 'Presença por pessoa, instrumento e mês.' },

  { to: 'mensalidades', label: 'Mensalidades', icon: Wallet, group: 'financeiro', permission: 'billing.read', description: 'Cobranças do mês e pagamentos.' },
  { to: 'bolsas', label: 'Bolsas', icon: Award, group: 'financeiro', permission: 'scholarships.manage', description: 'Quem tem bolsa e quanto isso pesa.' },

  { to: 'ciclos', label: 'Ciclos', icon: CalendarRange, group: 'organizacao', permission: 'cycles.manage', description: 'Períodos do bloco (ex.: Carnaval 2026/27).' },
  { to: 'fornecedores', label: 'Fornecedores', icon: Truck, group: 'organizacao', permission: 'suppliers.read', description: 'Contatos de som, tenda, banheiro e mais.' },
  { to: 'checklists', label: 'Checklists', icon: ListChecks, group: 'organizacao', permission: 'events.manage', description: 'Modelos de checklist para os eventos.' },
  { to: 'funcoes', label: 'Funções', icon: Tags, group: 'organizacao', permission: 'structure.manage', description: 'Produção, Apoio e outras funções; refletem em Contribuições.' },
  { to: 'drive', label: 'Google Drive', icon: FolderOpen, group: 'organizacao', permission: 'drive.read', description: 'Pastas do Drive e quem pode vê-las.' },

  { to: 'site', label: 'Site', icon: Globe, admin: true, permission: 'settings.manage' },
  { to: 'gerenciar-loja', label: 'Loja', icon: Store, admin: true, permission: 'shop.manage', description: 'Produtos, estoque e pedidos da loja.' },
  { to: 'interface', label: 'Interface', icon: Palette, admin: true, permission: 'org.manage' },
  { to: 'acesso', label: 'Acesso e papéis', icon: ShieldCheck, admin: true, permission: 'roles.manage' },
  { to: 'auditoria', label: 'Auditoria', icon: History, admin: true, permission: 'audit.read' },
]

const SUB_LABEL: Record<string, string> = { configuracoes: 'Configurações', organograma: 'Organograma', nomes: 'Nomes de naipes', funcoes: 'Funções' }

/** Caminho de navegação (breadcrumb) a partir das partes da URL depois do slug. O último item é a página atual (sem link). */
export function crumbsFor(segs: string[], base: string): { label: string; to?: string }[] {
  if (segs.length === 0) return []
  const first = segs[0] === 'lista-de-espera' ? 'vagas' : segs[0]
  const hubKey = (HUB_ORDER as string[]).includes(first) ? (first as HubKey) : undefined
  const item = NAV_ITEMS.find((i) => i.to === first)
  const out: { label: string; to?: string }[] = []
  if (hubKey) {
    out.push({ label: HUBS[hubKey].label, to: segs.length > 1 ? `${base}/${hubKey}` : undefined })
  } else if (item) {
    if (item.group) out.push({ label: HUBS[item.group].label, to: `${base}/${item.group}` })
    out.push({ label: item.crumb ?? item.label, to: segs.length > 1 ? `${base}/${first}` : undefined })
  }
  if (segs.length > 1 && !hubKey) {
    let path = `${base}/${first}`
    segs.slice(1).forEach((seg, i, rest) => {
      path += `/${seg}`
      const last = i === rest.length - 1
      out.push({ label: SUB_LABEL[seg] ?? 'Detalhe', to: last ? undefined : path })
    })
  }
  return out
}
