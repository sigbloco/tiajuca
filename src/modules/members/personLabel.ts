import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { shortName } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

export interface PersonRef { full_name: string; display_name: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/**
 * Nome para escolher/mostrar uma pessoa: o primeiro nome (e o "como prefere ser chamado" entre parênteses).
 * Se duas pessoas ficariam iguais (duas "Letícia"), mostra o nome completo, com o apelido entre parênteses.
 */
export function usePersonLabeler() {
  const orgId = useOrgId()
  const { data } = useQuery({
    queryKey: ['members', orgId, 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; display_name: string | null; email: string | null }[]
    },
  })
  const counts = new Map<string, number>()
  for (const p of data ?? []) { const k = norm(shortName(p.full_name, p.display_name)); counts.set(k, (counts.get(k) ?? 0) + 1) }
  return useCallback((p: PersonRef) => {
    const short = shortName(p.full_name, p.display_name)
    if ((counts.get(norm(short)) ?? 0) < 2) return short
    const pref = (p.display_name ?? '').trim()
    return pref && norm(pref) !== norm(p.full_name) ? `${p.full_name} (${pref})` : p.full_name
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
}
