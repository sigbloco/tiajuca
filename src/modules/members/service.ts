import { socialUrl } from '@/core/social'
import { supabase } from '@/core/supabase'

export interface MemberRow {
  id: string
  full_name: string
  display_name: string | null
  email: string | null
  phone: string | null
  social_handle: string | null
  birth_date?: string | null
  user_id: string | null
  archived_at: string | null
}

export interface NewMember {
  full_name: string
  display_name?: string
  email?: string
  phone?: string
  social?: string
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
      phone: clean(m.phone)?.replace(/\D/g, '') ?? null,
      social_handle: socialUrl(m.social),
      birth_date: clean(m.birth_date),
      joined_at: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
