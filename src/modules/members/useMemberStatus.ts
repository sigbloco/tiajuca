import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCycleStatuses, useCycles, type CycleStatus } from '@/modules/cycles/service'

/** Situação de cada integrante no ciclo atual (ativo, inativo, lista de espera). Sem registro no ciclo = sem situação. */
export function useMemberStatus() {
  const orgId = useOrgId()
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const currentCycle = cycles?.find((c) => c.is_current)?.id
  const rows = useQuery({
    queryKey: ['members', orgId, 'cycle-status', currentCycle],
    enabled: !!currentCycle,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('member_id, status_id').eq('cycle_id', currentCycle!).limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; status_id: string }[]
    },
  })
  const statusOf = useMemo(() => {
    const byStatus = new Map((statuses ?? []).map((s) => [s.id, s]))
    return new Map<string, CycleStatus | undefined>((rows.data ?? []).map((r) => [r.member_id, byStatus.get(r.status_id)]))
  }, [statuses, rows.data])
  /** Inativo = sem situação no ciclo atual ou com situação que não conta como ativa nem é lista de espera. */
  const isInactive = (memberId: string) => { const st = statusOf.get(memberId); return !st || (!st.counts_as_active && !st.is_waitlist) }
  return { statusOf, isInactive, ready: !!currentCycle && !rows.isLoading }
}
