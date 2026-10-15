import { supabase } from '@/core/supabase'

// Naipe (sections) → Subnaipe (subsections, interno da equipe) → Instrumento (instruments)
export type CatalogTable = 'sections' | 'subsections' | 'instruments' | 'artistic_functions' | 'skill_levels'

export interface CatalogItem {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  section_id?: string | null
  subsection_id?: string | null
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
) {
  const { id, ...fields } = item
  const q = id
    ? supabase.from(table).update(fields).eq('id', id).eq('organization_id', orgId)
    : supabase.from(table).insert({ ...fields, organization_id: orgId })
  const { error } = await q
  if (error) throw error
}

/** Troca a ordem de dois itens (reordenação simples por setas). */
export async function swapOrder(table: CatalogTable, orgId: string, a: CatalogItem, b: CatalogItem) {
  await Promise.all([
    saveCatalogItem(table, orgId, { id: a.id, name: a.name, sort_order: b.sort_order }),
    saveCatalogItem(table, orgId, { id: b.id, name: b.name, sort_order: a.sort_order }),
  ])
}
