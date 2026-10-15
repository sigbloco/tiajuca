import { supabase } from '@/core/supabase'

export interface MemberRow {
  id: string
  full_name: string
  display_name: string | null
  email: string | null
  phone: string | null
  user_id: string | null
  archived_at: string | null
}

export interface MemberListParams {
  orgId: string
  search: string
  page: number
  pageSize: number
  sort: 'full_name' | 'created_at'
  ascending: boolean
  includeArchived: boolean
}

// Busca, ordenação e paginação executadas no banco (nunca em memória no front).
export async function listMembers(p: MemberListParams) {
  const from = p.page * p.pageSize
  let q = supabase
    .from('members')
    .select('id, full_name, display_name, email, phone, user_id, archived_at', { count: 'exact' })
    .eq('organization_id', p.orgId)
    .order(p.sort, { ascending: p.ascending })
    .range(from, from + p.pageSize - 1)
  if (!p.includeArchived) q = q.is('archived_at', null)
  const term = p.search.replace(/[%*,()]/g, ' ').trim()
  if (term) q = q.or(`full_name.ilike.%${term}%,display_name.ilike.%${term}%,email.ilike.%${term}%`)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as MemberRow[], total: count ?? 0 }
}

export interface NewMember {
  full_name: string
  display_name?: string
  email?: string
  phone?: string
  birth_date?: string
}

export async function createMember(orgId: string, m: NewMember) {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null)
  const { data, error } = await supabase
    .from('members')
    .insert({
      organization_id: orgId,
      full_name: m.full_name.trim(),
      display_name: clean(m.display_name),
      email: clean(m.email)?.toLowerCase() ?? null,
      phone: clean(m.phone),
      birth_date: clean(m.birth_date),
      joined_at: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function createInvite(memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_member_invite', { p_member: memberId })
  if (error) throw error
  return data as string
}
