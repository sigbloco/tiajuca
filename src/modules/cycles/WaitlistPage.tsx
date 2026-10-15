import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, Label, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { CycleSelect } from './CycleSelect'
import { setMemberCycleStatus } from './service'

interface WaitRow {
  id: string
  member_id: string
  waitlisted_at: string | null
  members: { full_name: string; display_name: string | null } | null
  instruments: { name: string } | null
}

export function WaitlistPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('member_cycles.manage', 'group')
  const canForce = usePermission('capacity.manage')
  const instruments = useCatalog('instruments')
  const [cycleId, setCycleId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [instrumentId, setInstrumentId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['waitlist', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_cycles')
        .select('id, member_id, waitlisted_at, members(full_name, display_name), instruments(name), member_cycle_statuses!inner(is_waitlist)')
        .eq('organization_id', orgId)
        .eq('cycle_id', cycleId)
        .eq('member_cycle_statuses.is_waitlist', true)
        .order('waitlisted_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as WaitRow[]
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['waitlist', orgId] })
    qc.invalidateQueries({ queryKey: ['capacity', orgId] })
  }

  const promote = useMutation({
    mutationFn: (v: { member: string; force?: boolean }) => setMemberCycleStatus({ member: v.member, cycle: cycleId, status: 'active', force: v.force }),
    onSuccess: () => {
      toast.success('Integrante promovido para ativo.')
      refresh()
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (canForce && /lotado/i.test(msg) && !v.force) {
        toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => promote.mutate({ member: v.member, force: true }) } })
      } else toast.error(msg)
    },
  })
  const enqueue = useMutation({
    mutationFn: () => setMemberCycleStatus({ member: memberId, cycle: cycleId, status: 'waitlist', waitlistInstrument: instrumentId || undefined }),
    onSuccess: () => {
      toast.success('Adicionado à lista de espera.')
      setMemberId('')
      refresh()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Lista de espera</h1>
        <CycleSelect value={cycleId} onChange={setCycleId} />
      </div>

      {canManage && cycleId && (
        <Card className="space-y-3 p-4">
          <h3>Adicionar à fila</h3>
          <MemberPicker value={memberId} onChange={setMemberId} />
          <div className="space-y-1.5">
            <Label htmlFor="wl-instrument">Instrumento desejado</Label>
            <Select id="wl-instrument" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
              <option value="">Qualquer / não informado</option>
              {instruments.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <Button disabled={!memberId || enqueue.isPending} onClick={() => enqueue.mutate()}>Adicionar</Button>
        </Card>
      )}

      {isLoading && <Skeleton className="h-24" />}
      {data?.length === 0 && <EmptyState>Ninguém na lista de espera deste ciclo.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((r, i) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{i + 1}. {r.members?.display_name ?? r.members?.full_name}</p>
              <p className="text-muted-foreground">
                {r.instruments?.name ?? 'Instrumento não informado'} · desde {formatDateTime(r.waitlisted_at, membership?.timezone)}
              </p>
            </div>
            {canManage && (
              <Button size="sm" disabled={promote.isPending} onClick={() => promote.mutate({ member: r.member_id })}>
                <ArrowUpCircle className="h-4 w-4" /> Promover
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
