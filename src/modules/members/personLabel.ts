import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { givenName, shortName } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

export interface PersonRef { full_name: string; display_name: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Último sobrenome do nome completo ("Leonardo Silva Souza" → "Souza"). */
export const lastSurname = (full: string) => full.trim().split(/[ ]+/).slice(1).pop() ?? ''

/** Primeiro nome + último sobrenome ("Leonardo Souza"), para separar quem tem o mesmo primeiro nome. */
export const nameWithSurname = (full: string, display?: string | null) => `${givenName(full, display)} ${lastSurname(full)}`.trim()

/**
 * Nome para escolher/mostrar uma pessoa: o primeiro nome (e o "como prefere ser chamado" entre parênteses).
 * Se duas pessoas ficariam iguais (dois "Leonardo"), acrescenta o último sobrenome ("Leonardo Souza"); se ainda forem iguais, o nome completo. O apelido continua entre parênteses.
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
  const two = new Map<string, number>()
  for (const p of data ?? []) { const k = norm(nameWithSurname(p.full_name, p.display_name)); two.set(k, (two.get(k) ?? 0) + 1) }
  return useCallback((p: PersonRef) => {
    const short = shortName(p.full_name, p.display_name)
    if ((counts.get(norm(short)) ?? 0) < 2) return short
    const pref = (p.display_name ?? '').trim()
    const withSurname = nameWithSurname(p.full_name, p.display_name)
    const base = (two.get(norm(withSurname)) ?? 0) < 2 ? withSurname : p.full_name
    return pref && norm(pref) !== norm(base) && !norm(base).split(' ').includes(norm(pref)) ? `${base} (${pref})` : base
  }, [data])
}
