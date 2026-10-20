import { supabase } from '@/core/supabase'

// Naipe (sections) → Subnaipe (subsections, interno da equipe) → Instrumento (instruments)
export type CatalogTable = 'sections' | 'subsections' | 'instruments' | 'artistic_functions' | 'skill_levels' | 'activity_types' | 'fee_categories' | 'section_names'

export interface CatalogItem {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  section_id?: string | null
  color?: string
  subsection_id?: string | null
  tuning?: string | null
  has_tuning?: boolean
}

export async function listCatalog(table: CatalogTable, orgId: string): Promise<CatalogItem[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('organization_id', orgId)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return (data ?? []) as CatalogItem[]
}

export async function saveCatalogItem(
  table: CatalogTable,
  orgId: string,
  item: Partial<CatalogItem> & { name: string },
): Promise<string | undefined> {
  const { id, ...fields } = item
  if (id) {
    const { error } = await supabase.from(table).update(fields).eq('id', id).eq('organization_id', orgId)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from(table).insert({ ...fields, organization_id: orgId }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Troca a posição de dois itens. Com a lista na ordem exibida, renumera tudo (1, 2, 3…), então funciona mesmo com ordens repetidas. */
export async function swapOrder(table: CatalogTable, orgId: string, a: CatalogItem, b: CatalogItem, list?: CatalogItem[]) {
  if (!list) {
    await Promise.all([
      saveCatalogItem(table, orgId, { id: a.id, name: a.name, sort_order: b.sort_order }),
      saveCatalogItem(table, orgId, { id: b.id, name: b.name, sort_order: a.sort_order }),
    ])
    return
  }
  const ordered = list.slice()
  const ia = ordered.findIndex((x) => x.id === a.id)
  const ib = ordered.findIndex((x) => x.id === b.id)
  if (ia < 0 || ib < 0) return
  ;[ordered[ia], ordered[ib]] = [ordered[ib], ordered[ia]]
  await Promise.all(ordered.map((it, i) => (it.sort_order === i + 1 ? null : saveCatalogItem(table, orgId, { id: it.id, name: it.name, sort_order: i + 1 }))))
}

/** Depois de mexer em qualquer catálogo (categorias, instrumentos, naipes…), tudo que mostra esses nomes se atualiza sozinho. */
export function invalidateCatalog(qc: import('@tanstack/react-query').QueryClient, orgId: string) {
  for (const key of [['catalog'], ['members'], ['member-links'], ['staff-assignments'], ['fee-prices'], ['drive-folders'], ['capacity'], ['waitlist']]) {
    qc.invalidateQueries({ queryKey: key })
  }
  void orgId
}

/** O que mudou, com os valores de ANTES: serve para o "Desfazer" regravar o item como estava. */
export function previousOf(items: CatalogItem[] | undefined, patch: Partial<CatalogItem> & { name: string }) {
  const prev = items?.find((i) => i.id === patch.id)
  if (!prev || !patch.id) return null
  const out: Record<string, unknown> = { id: prev.id, name: prev.name }
  for (const k of Object.keys(patch) as (keyof CatalogItem)[]) {
    if (k !== 'id' && k !== 'name') out[k] = prev[k] === undefined ? null : prev[k]
  }
  return out as Partial<CatalogItem> & { name: string }
}

/** Mensagem curta do que foi feito, a partir do que mudou. */
export function describeChange(patch: Partial<CatalogItem>, singular: string): string {
  if (patch.is_active === false) return `${singular} desativado.`
  if (patch.is_active === true) return `${singular} reativado.`
  if (patch.sort_order !== undefined) return 'Ordem alterada.'
  return 'Alteração salva.'
}

/** Funções refletem em Contribuições (categorias de mensalidade): cria, renomeia e ativa/desativa a categoria de mesmo nome. Melhor esforço: quem não pode mexer em contribuições não vê erro. */
export async function mirrorFunctionToFees(orgId: string, change: { created?: string; renamed?: { from: string; to: string }; active?: { name: string; value: boolean } }) {
  try {
    if (change.created) {
      const { data } = await supabase.from('fee_categories').select('id, sort_order').eq('organization_id', orgId)
      await supabase.from('fee_categories').upsert({ organization_id: orgId, name: change.created, sort_order: ((data ?? []).reduce((m, r) => Math.max(m, r.sort_order as number), 0)) + 1 }, { onConflict: 'organization_id,name', ignoreDuplicates: true })
    }
    if (change.renamed) await supabase.from('fee_categories').update({ name: change.renamed.to }).eq('organization_id', orgId).eq('name', change.renamed.from)
    if (change.active) await supabase.from('fee_categories').update({ is_active: change.active.value }).eq('organization_id', orgId).eq('name', change.active.name)
  } catch { /* contribuições podem exigir outra permissão */ }
}

/** Move `fromId` para a posição de `toId` na lista (na ordem exibida) e renumera tudo (1, 2, 3…). */
export async function moveItemTo(table: CatalogTable, orgId: string, list: CatalogItem[], fromId: string, toId: string) {
  const ordered = list.slice()
  const from = ordered.findIndex((x) => x.id === fromId)
  const to = ordered.findIndex((x) => x.id === toId)
  if (from < 0 || to < 0 || from === to) return
  const [it] = ordered.splice(from, 1)
  ordered.splice(to, 0, it)
  await Promise.all(ordered.map((x, i) => (x.sort_order === i + 1 ? null : saveCatalogItem(table, orgId, { id: x.id, name: x.name, sort_order: i + 1 }))))
}
