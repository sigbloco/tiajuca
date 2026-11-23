import { supabase } from '@/core/supabase'

export interface SupplierCategory { id: string; name: string; sort_order: number; is_active: boolean }
export interface Supplier {
  id: string; category_id: string; name: string
  phone: string | null; email: string | null; website: string | null; notes: string | null; is_active: boolean
}

export async function listSupplierCategories(orgId: string) {
  const { data, error } = await supabase.from('supplier_categories').select('*').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return data as SupplierCategory[]
}

export async function listSuppliers(orgId: string) {
  const { data, error } = await supabase.from('suppliers').select('*').eq('organization_id', orgId).order('name')
  if (error) throw error
  return data as Supplier[]
}

export { whatsappUrl } from '@/core/whatsapp'
