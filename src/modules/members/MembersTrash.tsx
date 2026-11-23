import { usePurge } from '@/core/purge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { toast } from 'sonner'
import { TrashGroup } from '@/components/shared/TrashGroup'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'

/** Lixeira de integrantes (ícone ao lado do "+"): quem foi excluído fica aqui e pode ser restaurado. */
export function MembersTrash() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const can = usePermission('members.manage')
  const q = useQuery({
    queryKey: ['members-archived', orgId],
    enabled: can,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email').eq('organization_id', orgId).not('archived_at', 'is', null).order('full_name').limit(500)
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; display_name: string | null; email: string | null }[]
    },
  })
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('members').update({ archived_at: null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Integrante restaurado.'); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['members-archived'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const purge = usePurge('members')
  if (!can) return null
  return <TrashGroup onPurge={(id) => purge.mutate(id)} entries={(q.data ?? []).map((m) => ({ id: m.id, name: shortName(m.full_name, m.display_name), detail: m.email ?? undefined }))} onRestore={(id) => restore.mutate(id)} />
}
