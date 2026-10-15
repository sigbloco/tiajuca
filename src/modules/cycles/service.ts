import { useQuery } from '@tanstack/react-query'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

export interface CycleType { id: string; key: string; name: string; is_active: boolean }
export interface Cycle {
  id: string
  cycle_type_id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'planned' | 'open' | 'closed'
  is_active: boolean
  is_current: boolean
}
export interface CycleStatus {
  id: string
  key: string
  name: string
  counts_as_active: boolean
  is_waitlist: boolean
  sort_order: number
  is_active: boolean
}

export const CYCLE_STATUS_LABEL: Record<Cycle['status'], string> = { planned: 'Planejado', open: 'Em andamento', closed: 'Encerrado' }

export function useCycles() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['cycles', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycles').select('*').eq('organization_id', orgId).order('starts_on', { ascending: false })
      if (error) throw error
      return (data ?? []) as Cycle[]
    },
  })
}

export function useCycleTypes() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['cycle-types', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_types').select('*').eq('organization_id', orgId).order('name')
      if (error) throw error
      return (data ?? []) as CycleType[]
    },
  })
}

export function useCycleStatuses() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['cycle-statuses', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycle_statuses').select('*').eq('organization_id', orgId).eq('is_active', true).order('sort_order')
      if (error) throw error
      return (data ?? []) as CycleStatus[]
    },
  })
}

/** Ciclo atual, se houver; senão o mais recente ativo. */
export function pickDefaultCycle(cycles: Cycle[] | undefined): string {
  return cycles?.find((c) => c.is_current)?.id ?? cycles?.find((c) => c.is_active)?.id ?? ''
}

export async function setMemberCycleStatus(args: {
  member: string
  cycle: string
  status: string
  notes?: string
  waitlistSection?: string
  force?: boolean
}) {
  const { error } = await supabase.rpc('set_member_cycle_status', {
    p_member: args.member,
    p_cycle: args.cycle,
    p_status_key: args.status,
    p_notes: args.notes ?? null,
    p_waitlist_section: args.waitlistSection ?? null,
    p_force: args.force ?? false,
  })
  if (error) throw error
}
