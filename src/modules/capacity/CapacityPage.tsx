import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { CycleSelect } from '@/modules/cycles/CycleSelect'

interface Row {
  section_id: string
  section_name: string
  capacity: number | null
  occupied: number
  available: number | null
  is_full: boolean
}

function CapacityInput({ row, cycleId }: { row: Row; cycleId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async (capacity: number) => {
      const { error } = await supabase
        .from('section_cycle_capacity')
        .upsert({ organization_id: orgId, section_id: row.section_id, cycle_id: cycleId, capacity }, { onConflict: 'section_id,cycle_id' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Limite atualizado.')
      qc.invalidateQueries({ queryKey: ['capacity', orgId] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      className="h-9 w-24"
      aria-label={`Limite de vagas de ${row.section_name}`}
      defaultValue={row.capacity ?? ''}
      placeholder="Sem limite"
      onBlur={(e) => {
        const v = e.target.value
        if (v === '' || Number(v) === row.capacity) return
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0) return toast.error('Informe um número inteiro maior ou igual a zero.')
        save.mutate(n)
      }}
    />
  )
}

export function CapacityPage() {
  const orgId = useOrgId()
  const canManage = usePermission('capacity.manage')
  const [cycleId, setCycleId] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['capacity', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_section_cycle_overview')
        .select('section_id, section_name, capacity, occupied, available, is_full')
        .eq('organization_id', orgId)
        .eq('cycle_id', cycleId)
        .order('sort_order')
        .order('section_name')
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })
  const full = data?.filter((r) => r.is_full).length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Vagas por naipe</h1>
        <CycleSelect value={cycleId} onChange={setCycleId} />
      </div>
      {cycleId && <p className="text-muted-foreground">{full} {full === 1 ? 'naipe lotado' : 'naipes lotados'}. A contagem considera integrantes ativos no ciclo.</p>}
      {isLoading && <Skeleton className="h-32" />}
      {!cycleId && <EmptyState>Crie um ciclo em “Ciclos” para definir vagas.</EmptyState>}
      <div className="grid gap-2 sm:grid-cols-2">
        {data?.map((r) => (
          <Card key={r.section_id} className={cn('flex items-center justify-between gap-3 p-3', r.is_full && 'border-destructive/50')}>
            <div>
              <p className="font-semibold">{r.section_name} {r.is_full && <Badge className="bg-destructive/15 text-destructive">Lotado</Badge>}</p>
              <p className="text-muted-foreground">
                {r.occupied} ocupadas{r.capacity !== null ? ` · ${r.available} livres` : ' · sem limite'}
              </p>
            </div>
            {canManage ? <CapacityInput row={r} cycleId={cycleId} /> : <span className="font-display text-xl font-bold">{r.capacity ?? '∞'}</span>}
          </Card>
        ))}
      </div>
    </div>
  )
}
