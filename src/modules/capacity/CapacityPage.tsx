import { useLayoutEffect, useRef, useState } from 'react'
import { useProgressive } from '@/components/shared/LoadMore'
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
    // capacity null = sem limite (infinito): a linha do limite é apagada.
    mutationFn: async (capacity: number | null) => {
      const { error } = capacity === null
        ? await supabase.from('instrument_cycle_capacity').delete().eq('instrument_id', row.instrument_id).eq('cycle_id', cycleId)
        : await supabase.from('instrument_cycle_capacity')
          .upsert({ organization_id: orgId, instrument_id: row.instrument_id, cycle_id: cycleId, capacity }, { onConflict: 'instrument_id,cycle_id' })
      if (error) throw error
    },
    onSuccess: (_d, capacity) => {
      const before = row.capacity
      qc.invalidateQueries({ queryKey: ['capacity', orgId] })
      notifyChange('Limite atualizado.', async () => {
        const { error } = before === null
          ? await supabase.from('instrument_cycle_capacity').delete().eq('instrument_id', row.instrument_id).eq('cycle_id', cycleId)
          : await supabase.from('instrument_cycle_capacity')
            .upsert({ organization_id: orgId, instrument_id: row.instrument_id, cycle_id: cycleId, capacity: before }, { onConflict: 'instrument_id,cycle_id' })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['capacity', orgId] })
      })
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
      allowEmpty
      aria-label={`Limite de vagas de ${row.instrument_name}`}
      placeholder="∞"
      value={row.capacity === null ? '' : String(row.capacity)}
      onSave={(v) => {
        // Vazio ou 0 = sem limite (infinito).
        const n = v === '' ? 0 : Number(v)
        if (!Number.isInteger(n) || n < 0) { toast.error('Informe um número inteiro maior ou igual a zero.'); return }
        return save.mutateAsync(n === 0 ? null : n)
      }}
    />
  )
}


/** Quadro "ocupadas/vagas": largura fixa e nunca quebra, igual nos cartões e nos títulos dos naipes (ficam alinhados). */
const TOTAL_BOX = 'flex w-[4.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-muted/60 px-1 font-display text-xl font-bold'

/** Cartões de um naipe: mostra 2 linhas por vez (o número por linha depende da largura da tela) e "Ver mais" libera mais 2 linhas. */
function SectionGrid({ rows, cycleId, canManage }: { rows: Row[]; cycleId: string; canManage: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(2)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { visible, button } = useProgressive(rows, cols * 2)
  return (
    <div ref={ref} className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
      {visible.map((r) => (
        <Card key={r.instrument_id} className={cn('flex items-stretch gap-2 p-2.5', r.is_full && 'border-destructive/50')}>
          {/* Esquerda: nome (quebra de linha se faltar espaço) e, embaixo, o número de vagas. Direita: ocupadas/vagas, que nunca quebra. */}
          <div className="min-w-0 space-y-1.5">
            <p className="font-semibold">{r.instrument_name}</p>
            {canManage ? <CapacityInput row={r} cycleId={cycleId} /> : <span className="font-display text-xl font-bold">{r.capacity ?? '∞'}</span>}
          </div>
          <div className={cn(TOTAL_BOX, 'self-stretch')}
            title={r.capacity === null ? 'Sem limite de vagas' : `${r.occupied} ocupadas de ${r.capacity} vagas`}>
            {r.occupied}/{r.capacity ?? '∞'}
          </div>
        </Card>
      ))}
      {button}
    </div>
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
          {/* Título: total do naipe (ocupadas/vagas; ∞ se algum instrumento não tem limite) antes do nome. */}
          <div className="flex items-center gap-2">
            <span className={cn(TOTAL_BOX, 'py-0.5 text-base')}>{rows.reduce((s, r) => s + r.occupied, 0)}/{rows.some((r) => r.capacity === null) ? '∞' : rows.reduce((s, r) => s + (r.capacity ?? 0), 0)}</span>
            <h3>{section}</h3>
          </div>
          <SectionGrid rows={rows} cycleId={cycleId} canManage={canManage} />
        </section>
      ))}
    </div>
  )
}
