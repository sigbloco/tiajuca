import { supabase } from '@/core/supabase'
import type { LinkKind } from './links'

export interface Album {
  id: string
  url: string
  title: string
  event_date: string | null
  author_kind: LinkKind
  author_value: string | null
  cover_url: string | null
  sort_order: number
  is_active: boolean
}
export type PublicAlbum = Pick<Album, 'id' | 'url' | 'title' | 'event_date' | 'author_kind' | 'author_value' | 'cover_url'>

/**
 * Nome padrão dos álbuns: "250608 Aniversário do Museu Nacional (@brunosarlas)".
 * Vira data (2025-06-08), título e @ do autor (assumido do Instagram; dá para mudar em cada álbum).
 */
export function parseAlbumTitle(raw: string): { event_date: string | null; title: string; handle: string | null } {
  const m = raw.trim().match(/^(\d{2})(\d{2})(\d{2})\s+(.+?)(?:\s*\(@([A-Za-z0-9._]+)\))?\s*$/)
  if (!m) return { event_date: null, title: raw.trim(), handle: null }
  const [, yy, mm, dd, title, handle] = m
  const month = Number(mm), day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) return { event_date: null, title: raw.trim(), handle: null }
  return { event_date: `20${yy}-${mm}-${dd}`, title: title.trim(), handle: handle ?? null }
}

/** "2025-06-08" → "08/06/2025". */
export const albumDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

export async function previewAlbum(orgId: string, url: string): Promise<{ title: string; cover_url: string | null }> {
  const { data, error } = await supabase.functions.invoke('album-preview', { body: { organization_id: orgId, url } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null
    throw new Error(msg ?? 'Não foi possível ler o álbum agora.')
  }
  return data as { title: string; cover_url: string | null }
}

export async function listAlbums(orgId: string): Promise<Album[]> {
  const { data, error } = await supabase.from('site_albums').select('*').eq('organization_id', orgId).order('sort_order').order('event_date', { ascending: false, nullsFirst: false }).limit(1000)
  if (error) throw error
  return (data ?? []) as Album[]
}
