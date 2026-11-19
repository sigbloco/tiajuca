import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { friendlyError } from '@/core/errors'
import { loadRolesAccess, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import {
  CATEGORY_ROLES, RELEASE_CATEGORIES, RELEASE_PAGES, categoriesOf, hasAnyPage, isReleasedFor, pageAccessible, pageKeyForPath, releasePage, rowKey,
  type Access, type ReleaseCategory, type ReleaseChange, type ReleaseRows,
} from './releases'

/** Linhas de liberação gravadas (todos os membros leem: o menu precisa). */
export function usePageReleaseRows() {
  const { realMembership } = useOrganization()
  const orgId = realMembership?.organization_id
  return useQuery({
    queryKey: ['page-releases', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ReleaseRows> => {
      const { data, error } = await supabase.from('page_releases').select('page_key, category, released').eq('organization_id', orgId!)
      if (error) throw error
      return new Map((data ?? []).map((r) => [rowKey(r.page_key as string, r.category as ReleaseCategory), r.released as boolean]))
    },
  })
}

/** O que cada categoria tem de acesso em "Acesso e papéis" (para saber quais células ficam desabilitadas). Só Titular/Direção usam. */
export function useCategoryAccess(enabled = true) {
  const { realMembership } = useOrganization()
  const orgId = realMembership?.organization_id
  return useQuery({
    queryKey: ['page-release-category-access', orgId],
    enabled: !!orgId && enabled,
    queryFn: async (): Promise<Record<ReleaseCategory, Access>> => {
      const out = {} as Record<ReleaseCategory, Access>
      await Promise.all(RELEASE_CATEGORIES.map(async (c) => {
        out[c.key] = await loadRolesAccess(orgId!, CATEGORY_ROLES[c.key], c.key === 'inativo')
      }))
      return out
    },
  })
}

/** A liberação das páginas para quem está usando o app agora (já considerando o "Visualizar como"). */
export function useMyReleases() {
  const { membership, loading } = useOrganization()
  const rows = usePageReleaseRows()
  return useMemo(() => {
    const ready = !!membership && !loading && !rows.isLoading
    const data: ReleaseRows = rows.data ?? new Map()
    const access: Access | null = membership ? { roles: membership.roles, permissions: membership.permissions } : null
    const cats = membership ? categoriesOf(membership) : 'all'
    return {
      ready,
      /** Titular: tudo liberado, sem caixas a respeitar. */
      all: cats === 'all',
      /** A página (chave) está liberada para esta pessoa? Subpágina também depende da área. */
      released: (page: string) => isReleasedFor(data, page, cats),
      /** Alguma página abrível (acesso + liberação)? */
      anyPage: access ? hasAnyPage(data, access, membership?.inactive) : false,
      /** Página da URL atual: a chave, se a pessoa tem acesso a ela mas ela não está liberada. */
      blockedFor: (rest: string): string | null => {
        const key = pageKeyForPath(rest)
        const p = key ? releasePage(key) : undefined
        if (!key || !p || !access) return null
        return pageAccessible(p, access) && !isReleasedFor(data, key, cats) ? key : null
      },
    }
  }, [membership, loading, rows.data, rows.isLoading])
}

/** Grava liberações (Titular). Atualiza a tela na hora e confirma com o servidor. */
export function useSetReleases() {
  const qc = useQueryClient()
  const { realMembership } = useOrganization()
  const orgId = realMembership?.organization_id
  return useMutation({
    mutationFn: async (changes: ReleaseChange[]) => {
      if (changes.length === 0) return
      const { error } = await supabase.rpc('set_page_releases', { p_org: orgId!, p_changes: changes })
      if (error) throw error
    },
    onMutate: async (changes) => {
      await qc.cancelQueries({ queryKey: ['page-releases', orgId] })
      const prev = qc.getQueryData<ReleaseRows>(['page-releases', orgId])
      const next = new Map(prev ?? [])
      for (const c of changes) next.set(rowKey(c.page, c.category), c.released)
      qc.setQueryData(['page-releases', orgId], next)
      return { prev }
    },
    onError: (e, _c, ctx) => { if (ctx?.prev) qc.setQueryData(['page-releases', orgId], ctx.prev); toast.error(friendlyError(e)) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['page-releases', orgId] }) },
  })
}

export { RELEASE_PAGES }
