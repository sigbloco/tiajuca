import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, EmptyState, Skeleton, cn } from '@/components/ui/primitives'
import { SaveInput } from '@/components/shared/ConfirmField'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { VagasTabs } from './VagasTabs'

interface Row {
  instrument_id: string
  instrument_name: string
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
        .from('instrument_cycle_capacity')
        .upsert({ organization_id: orgId, instrument_id: row.instrument_id, cycle_id: cycleId, capacity }, { onConflict: 'instrument_id,cycle_id' })
      if (error) throw error
    },
    onSuccess: (_d, capacity) => {
      const before = row.capacity
      qc.invalidateQueries({ queryKey: ['capacity', orgId] })
      notifyChange('Limite atualizado.', before !== null ? async () => {
        const { error } = await supabase.from('instrument_cycle_capacity')
          .upsert({ organization_id: orgId, instrument_id: row.instrument_id, cycle_id: cycleId, capacity: before }, { onConflict: 'instrument_id,cycle_id' })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['capacity', orgId] })
      } : undefined)
      void capacity
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SaveInput
      className="flex-none"
      inputClassName="w-[3.25rem] flex-none px-1 text-center"
      numeric
      autoSave
      aria-label={`Limite de vagas de ${row.instrument_name}`}
      placeholder="∞"
      value={row.capacity === null ? '' : String(row.capacity)}
      onSave={(v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0) { toast.error('Informe um número inteiro maior ou igual a zero.'); return }
        return save.mutateAsync(n)
      }}
    />
  )
}


export function CapacityPage() {
  const orgId = useOrgId()
  const canManage = usePermission('capacity.manage')
  const { cycleId } = useSelectedCycle()
  const { data, isLoading } = useQuery({
    queryKey: ['capacity', orgId, cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_instrument_cycle_overview')
        .select('instrument_id, instrument_name, section_id, section_name, capacity, occupied, available, is_full')
        .eq('organization_id', orgId)
        .eq('cycle_id', cycleId)
        .order('section_order')
        .order('instrument_order')
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })
  const full = data?.filter((r) => r.is_full).length ?? 0
  const bySection = (data ?? []).reduce<Record<string, Row[]>>((acc, r) => {
    ;(acc[r.section_name] ??= []).push(r)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Vagas por instrumento</h1>
      </div>
      <VagasTabs />
      {cycleId && <p className="text-muted-foreground">{full} {full === 1 ? 'instrumento lotado' : 'instrumentos lotados'}. A contagem considera integrantes ativos no ciclo.</p>}
      {isLoading && <Skeleton className="h-32" />}
      {!cycleId && <EmptyState>Crie um ciclo em “Ciclos” para definir vagas.</EmptyState>}
      {Object.entries(bySection).map(([section, rows]) => (
        <section key={section} className="space-y-2">
          <h3>{section}</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <ProgressiveList items={rows} render={(r) => (
              <Card key={r.instrument_id} className={cn('flex items-stretch gap-3 p-3', r.is_full && 'border-destructive/50')}>
                {/* Esquerda: nome e, embaixo, o número de vagas. Direita: ocupadas/vagas, ocupando a altura toda do cartão. */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-semibold">{r.instrument_name}</p>
                  {canManage ? <CapacityInput row={r} cycleId={cycleId} /> : <span className="font-display text-xl font-bold">{r.capacity ?? '∞'}</span>}
                </div>
                <div className="flex shrink-0 items-center justify-center self-stretch rounded-lg bg-muted/60 px-3 font-display text-xl font-bold"
                  title={r.capacity === null ? 'Sem limite de vagas' : `${r.occupied} ocupadas de ${r.capacity} vagas`}>
                  {r.occupied}/{r.capacity ?? '∞'}
                </div>
              </Card>
            )} />
          </div>
        </section>
      ))}
    </div>
  )
}
