import { hasPermission, type GrantedPermission, type PermissionKey, type PermissionScope } from '@/core/permissions'
import { HUBS, HUB_ORDER, NAV_ITEMS, type HubKey } from '@/app/navigation'

/**
 * Liberação de páginas por categoria. Só RESTRINGE a interface: a página precisa estar liberada E a pessoa precisa ter a
 * permissão em "Acesso e papéis". O Titular vê tudo. Regras puras (sem rede/React), testadas em releases.test.ts.
 */

export const RELEASE_CATEGORIES = [
  { key: 'direcao', label: 'Direção', short: 'Dir.' },
  { key: 'professor', label: 'Professor', short: 'Prof.' },
  { key: 'monitor', label: 'Monitor', short: 'Mon.' },
  { key: 'ativo', label: 'Integrante ativo', short: 'Ativo' },
  { key: 'inativo', label: 'Integrante inativo', short: 'Inativo' },
] as const
export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number]['key']

/** Papéis simulados de cada categoria (os mesmos do "Visualizar como"). Inativo só tem o acesso "próprio". */
export const CATEGORY_ROLES: Record<ReleaseCategory, string[]> = {
  direcao: ['direcao', 'integrante'], professor: ['professor', 'integrante'], monitor: ['monitor', 'integrante'], ativo: ['integrante'], inativo: ['integrante'],
}

export interface ReleasePage {
  key: string
  label: string
  /** Subpágina de uma área (Oficina, Financeiro, Organização): herda a liberação da área. */
  hub?: HubKey
  isHub?: boolean
  permission?: PermissionKey
  minScope?: PermissionScope
  /** Organização só existe para Titular e Direção. */
  bossOnly?: boolean
  /** Redirecionamento para outra página (chave de destino): sem caixa própria, vale a do destino. */
  alias?: string
}

const pageKey = (to: string) => (to === '' ? 'inicio' : to)
const item = (to: string) => NAV_ITEMS.find((i) => i.to === to)!
const asPage = (to: string): ReleasePage => { const i = item(to); return { key: pageKey(to), label: i.label, permission: i.permission, minScope: i.minScope, hub: i.group } }
/**
 * Itens do menu que são só um redirecionamento para outra página (não têm página própria, então não têm caixa):
 * valem o que vale a página de destino e, por estarem dentro de uma área, também dependem da área.
 * Ex.: Oficina → Alunos abre Integrantes já filtrado.
 */
const ALIASES: Record<string, string> = { alunos: 'membros' }
const hubRows = (hub: HubKey): ReleasePage[] => [
  { key: hub, label: HUBS[hub].label, isHub: true, bossOnly: hub === 'organizacao' },
  ...NAV_ITEMS.filter((i) => i.group === hub && !(i.to in ALIASES)).map((i) => asPage(i.to)),
]

/** Todas as páginas liberáveis, na ordem em que aparecem na tabela. */
export const RELEASE_PAGES: ReleasePage[] = [
  asPage(''), asPage('perfil'), asPage('eventos'),
  ...hubRows('oficina'),
  asPage('membros'), asPage('formularios'), asPage('repertorio'), asPage('naipes'),
  ...hubRows('organizacao'), ...hubRows('financeiro'),
  ...NAV_ITEMS.filter((i) => i.admin).map((i) => asPage(i.to)),
]
const BY_KEY = new Map<string, ReleasePage>([...RELEASE_PAGES, ...Object.keys(ALIASES).map((to) => ({ ...asPage(to), alias: ALIASES[to] }))].map((p) => [p.key, p]))
export const releasePage = (key: string): ReleasePage | undefined => BY_KEY.get(key)

/** Página (da lista) a que um caminho da URL pertence; nulo se não for uma página liberável. `rest` = o que vem depois de /:slug. */
export function pageKeyForPath(rest: string): string | null {
  const first = rest.split('/').filter(Boolean)[0] ?? ''
  if (first === '') return 'inicio'
  if (first === 'vagas') return 'naipes' // Vagas fica dentro de Naipes e instrumentos
  return BY_KEY.has(first) ? first : null
}

/** Categorias de uma pessoa, ou 'all' para o Titular. Direção vale por si; Professor e Monitor somam; o resto é ativo ou inativo. */
export function categoriesOf(m: { roles: string[]; inactive?: boolean }): ReleaseCategory[] | 'all' {
  if (m.roles.includes('titular')) return 'all'
  if (m.inactive) return ['inativo']
  if (m.roles.includes('direcao')) return ['direcao']
  const staff: ReleaseCategory[] = []
  if (m.roles.includes('professor')) staff.push('professor')
  if (m.roles.includes('monitor')) staff.push('monitor')
  return staff.length ? staff : ['ativo']
}

/** Linhas gravadas: `${página}|${categoria}` → liberada. */
export type ReleaseRows = ReadonlyMap<string, boolean>
export const rowKey = (page: string, cat: ReleaseCategory) => `${page}|${cat}`

/** Sem linha gravada vale o padrão: Direção liberada, demais não. */
export function rawReleased(rows: ReleaseRows, page: string, cat: ReleaseCategory): boolean {
  return rows.get(rowKey(page, cat)) ?? cat === 'direcao'
}

/** Liberada de fato: a própria página e, se for subpágina, também a área dela. */
export function chainReleased(rows: ReleaseRows, page: string, cat: ReleaseCategory): boolean {
  const p = BY_KEY.get(page)
  if (!p) return true
  const own = p.alias ? chainReleased(rows, p.alias, cat) : rawReleased(rows, page, cat)
  return own && (!p.hub || rawReleased(rows, p.hub, cat))
}

export interface Access { permissions: GrantedPermission[]; roles: string[] }
const isBoss = (roles: string[]) => roles.includes('direcao') || roles.includes('titular')

/** A pessoa (ou a categoria) tem a permissão da página em "Acesso e papéis"? Sem permissão exigida, sim. */
export function pageAccessible(p: ReleasePage, a: Access): boolean {
  if (p.isHub) {
    if (p.bossOnly && !isBoss(a.roles)) return false
    const home = HUBS[p.key as HubKey]?.homePermission
    return (home ? hasPermission(a.permissions, home, 'own') : false) || NAV_ITEMS.some((i) => i.group === p.key && (!i.permission || hasPermission(a.permissions, i.permission, i.minScope ?? 'own')))
  }
  return !p.permission || hasPermission(a.permissions, p.permission, p.minScope ?? 'own')
}

/** A página está liberada para quem tem este acesso? (Titular: sempre.) Só vale quando `pageAccessible`; sem acesso, o resto do app decide. */
export function isReleasedFor(rows: ReleaseRows, page: string, cats: ReleaseCategory[] | 'all'): boolean {
  if (cats === 'all') return true
  return cats.some((c) => chainReleased(rows, page, c))
}

/** Há alguma página que a pessoa poderia abrir (acesso + liberação)? Senão aparece o aviso "nenhuma página liberada". */
export function hasAnyPage(rows: ReleaseRows, a: Access, inactive: boolean | undefined): boolean {
  const cats = categoriesOf({ roles: a.roles, inactive })
  return RELEASE_PAGES.some((p) => pageAccessible(p, a) && isReleasedFor(rows, p.key, cats))
}

/** Alterações a gravar. Desmarcar uma área apaga as subpáginas por herança (não mexe nelas); marcar a área não libera as subpáginas. */
export interface ReleaseChange { page: string; category: ReleaseCategory; released: boolean }

/** Todas as células editáveis de uma coluna (categoria) para marcar/desmarcar tudo. `editable` decide quais células valem (acesso e herança). */
export function columnChanges(cat: ReleaseCategory, released: boolean, editable: (p: ReleasePage) => boolean): ReleaseChange[] {
  return RELEASE_PAGES.filter(editable).map((p) => ({ page: p.key, category: cat, released }))
}

export const HUB_KEYS = HUB_ORDER
export type { PermissionScope }
