import { supabase } from '@/core/supabase'
import type { LinkKind } from './links'

export interface Author { kind: LinkKind; value: string }
export interface Album {
  id: string
  url: string
  title: string
  event_date: string | null
  authors: Author[]
  cover_url: string | null
  sort_order: number
  is_active: boolean
}
export type PublicAlbum = Pick<Album, 'id' | 'url' | 'title' | 'event_date' | 'authors' | 'cover_url'>

/**
 * Nome padrão dos álbuns: "250608 Aniversário do Museu Nacional (mídias por @brunosarlas e @fulana)".
 * Vira data (2025-06-08), título e a lista de @ (qualquer @ no nome; assumidos do Instagram, dá para mudar em cada álbum).
 */
export function parseAlbumTitle(raw: string): { event_date: string | null; title: string; handles: string[] } {
  let t = raw.trim()
  const handles = [...new Set([...t.matchAll(/@([A-Za-z0-9._]*[A-Za-z0-9_])/g)].map((m) => m[1]))]
  let event_date: string | null = null
  const m = t.match(/^(d{2})(d{2})(d{2})s+/)
  if (m) {
    const month = Number(m[2]), day = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) { event_date = `20${m[1]}-${m[2]}-${m[3]}`; t = t.slice(m[0].length) }
  }
  // Tira os parênteses que citam @ ("(mídias por @a e @b)") e qualquer @ solto que sobrar.
  t = t.replace(/^d{5}s+/, '')
  t = t.replace(/s*([^)]*@[^)]*)/g, '').replace(/s*@[A-Za-z0-9._]+/g, '').replace(/s+/g, ' ').trim()
  t = t.replace(/[s-–:,(]*(?:m[ií]dias?|fotos?|fotografias?|v[ií]deos?)s+(?:por|de)[s-–:,(]*$/i, '').trim() // sobra de "mídias por @fulano"
  return { event_date, title: t, handles }
}

/** "2025-06-08" → "08/06/2025". */
export const albumDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

export async function previewAlbum(orgId: string, url: string, opts?: { cover?: boolean }): Promise<{ title: string; cover_url: string | null }> {
  const { data, error } = await supabase.functions.invoke('album-preview', { body: { organization_id: orgId, url, cover: opts?.cover } })
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
