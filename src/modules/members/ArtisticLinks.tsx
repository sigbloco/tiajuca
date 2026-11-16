import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AutoComplete, Chip } from '@/components/shared/AutoComplete'
import { Button, Label, Select, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCycles } from '@/modules/cycles/service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { MemberSection } from './MemberSection'

/** Regência é uma atividade artística (atribuição de regente de um naipe, a mesma de Naipes): "Regência (Sopro)", "Regência (Percussão)"… aparecem ao lado dos instrumentos. Não é remunerada. */
const REGENCIA = '__regencia:'

interface LinkRow {
  id: string
  started_at?: string
  instrument_id: string | null
  function_id: string | null
  skill_level_id: string | null
 
  is_paid: boolean
  instruments: { name: string; section_id: string; sections: { name: string } | null } | null
  artistic_functions: { name: string } | null
  skill_levels: { name: string } | null
}
interface Draft { instrument_id: string; function_id: string; skill_level_id: string; is_paid: boolean }
const EMPTY: Draft = { instrument_id: '', function_id: '', skill_level_id: '', is_paid: false }

/** Vínculos artísticos do integrante: naipe → instrumento e/ou categoria. Editáveis. */
export function ArtisticLinks({ memberId, mode = 'artistic', cycle }: { memberId: string; mode?: 'artistic' | 'collab' | 'paid'; /** Ciclo mostrado. Ciclo atual: vínculos vigentes hoje. Outro ciclo (passado ou futuro): os do próprio ciclo, editáveis. */ cycle?: { id: string; starts_on: string; ends_on: string; is_current: boolean } }) {
  const collab = mode !== 'artistic' // colaborativa e remunerada só têm categoria
  const paid = mode === 'paid'
  const orgId = useOrgId()
  const qc = useQueryClient()
  const byCycle = !!cycle && !cycle.is_current // outro ciclo: tabela própria, uma linha por ciclo
  const table = byCycle ? 'cycle_participations' : 'member_artistic_links'
  const canManage = usePermission('members.manage')
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const levels = useCatalog('skill_levels')
  // null = fechado · 'new' = novo vínculo · id = editando aquele vínculo
  const [editing, setEditing] = useState<string | null>(null)
  const [f, setF] = useState<Draft>(EMPTY)
  const cycles = useCycles()
  const cycleId = byCycle ? cycle!.id : (cycles.data ?? []).find((c) => c.is_current)?.id
  const regentes = useQuery({
    queryKey: ['member-regencia', orgId, memberId, cycleId],
    enabled: !collab && Boolean(cycleId),
    queryFn: async () => {
      let q = supabase.from('staff_assignments').select('id, section_id').eq('organization_id', orgId).eq('member_id', memberId).eq('staff_kind', 'regente').eq('cycle_id', cycleId!)
      if (!byCycle) q = q.is('valid_to', null)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as { id: string; section_id: string | null }[]
    },
  })

  const { data } = useQuery({
    queryKey: ['member-links', orgId, memberId, mode, cycle?.id ?? 'now'],
    queryFn: async () => {
      const base = supabase
        .from(table)
        .select('id, instrument_id, function_id, skill_level_id, is_paid, instruments(name, section_id, sections(name)), artistic_functions(name), skill_levels(name)')
        .eq('member_id', memberId)
        .order('created_at')
      const { data, error } = await (byCycle ? base.eq('cycle_id', cycle!.id) : base.is('ended_at', null))
      if (error) throw error
      return ((data ?? []) as unknown as LinkRow[]).filter((l) => (l.instrument_id === null) === collab && (!collab || l.is_paid === paid))
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['member-links', orgId, memberId] })
    qc.invalidateQueries({ queryKey: ['capacity', orgId] })
    qc.invalidateQueries({ queryKey: ['staff-assignments'] })
    qc.invalidateQueries({ queryKey: ['members', orgId] })
  }
  const nn = (v: string) => v || null
  const close = () => { setEditing(null); setF({ ...EMPTY, is_paid: paid }) }
  const refreshReg = () => { qc.invalidateQueries({ queryKey: ['member-regencia', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['staff-assignments'] }); qc.invalidateQueries({ queryKey: ['members', orgId] }) }
  const addReg = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: memberId, staff_kind: 'regente', section_id: f.instrument_id.slice(REGENCIA.length), compensation: null, cycle_id: cycleId }); if (error) throw error },
    onSuccess: () => { close(); refreshReg(); toast.success('Regência adicionada.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const endReg = useMutation({
    mutationFn: async (id: string) => { const { error } = byCycle ? await supabase.from('staff_assignments').delete().eq('id', id) : await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id); if (error) throw error },
    onSuccess: () => { refreshReg(); toast.success('Regência encerrada.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const isReg = f.instrument_id.startsWith(REGENCIA)

  const save = useMutation({
    mutationFn: async () => {
      const row = collab ? { function_id: nn(f.function_id), is_paid: f.is_paid } : { instrument_id: nn(f.instrument_id), skill_level_id: nn(f.skill_level_id) }
      if (editing === 'new') {
        const { data: ins, error } = await supabase.from(table).insert({
          organization_id: orgId, member_id: memberId, ...(byCycle ? { cycle_id: cycle!.id } : {}), ...row, is_primary: (data?.length ?? 0) === 0,
        }).select('id').single()
        if (error) throw error
        return { kind: 'new' as const, id: (ins as { id: string }).id, prev: null }
      }
      const old = data?.find((l) => l.id === editing)
      const prev = old ? { instrument_id: old.instrument_id, function_id: old.function_id, skill_level_id: old.skill_level_id, is_paid: old.is_paid } : null
      const { error } = await supabase.from(table).update(row).eq('id', editing!)
      if (error) throw error
      return { kind: 'edit' as const, id: editing, prev }
    },
    onSuccess: (r) => {
      close(); refresh()
      notifyChange(r.kind === 'new' ? 'Vínculo adicionado.' : 'Vínculo atualizado.', async () => {
        const { error } = r.kind === 'new'
          ? (byCycle ? await supabase.from(table).delete().eq('id', r.id!) : await supabase.from(table).update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', r.id!))
          : await supabase.from(table).update(r.prev!).eq('id', r.id!)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(/check|violat/i.test(String(e)) ? collab ? 'Escolha uma categoria.' : 'Escolha uma atividade.' : friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      // Ciclo atual: encerra o vínculo (fica a data). Outro ciclo: tira a participação daquele ciclo.
      const { error } = byCycle ? await supabase.from(table).delete().eq('id', id) : await supabase.from(table).update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
      return data?.find((l) => l.id === id) ?? null
    },
    onSuccess: (gone, id) => {
      refresh()
      notifyChange(byCycle ? 'Participação removida do ciclo.' : 'Vínculo encerrado.', async () => {
        const { error } = byCycle && gone
          ? await supabase.from(table).insert({ organization_id: orgId, member_id: memberId, cycle_id: cycle!.id, instrument_id: gone.instrument_id, function_id: gone.function_id, skill_level_id: gone.skill_level_id, is_paid: gone.is_paid })
          : await supabase.from(table).update({ ended_at: null }).eq('id', id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const active = <T extends { is_active: boolean }>(items?: T[]) => items?.filter((i) => i.is_active) ?? []
  const instrumentLabel = (id: string) => {
    const i = instruments.data?.find((x) => x.id === id)
    return i ? `${i.name} · ${sections.data?.find((s) => s.id === i.section_id)?.name ?? ''}` : '—'
  }
  const startEdit = (l: LinkRow) => {
    setEditing(l.id)
    setF({ instrument_id: l.instrument_id ?? '', function_id: l.function_id ?? '', skill_level_id: l.skill_level_id ?? '', is_paid: l.is_paid })
  }

  const form = (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      {collab ? (
        <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Select className="min-w-0 flex-1" value={f.function_id} aria-label="Categoria" onChange={(e) => setF({ ...f, function_id: e.target.value })}>
            <option value="">Escolha a categoria</option>
            {active(functions.data).filter((i) => (i.kind ?? 'collab') === (f.is_paid ? 'paid' : 'collab')).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
          <Button size="sm" disabled={isReg ? addReg.isPending : (collab ? !f.function_id : !f.instrument_id) || save.isPending} onClick={() => (isReg ? addReg.mutate() : save.mutate())}>OK</Button>
          <Button size="sm" variant="outline" onClick={close} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /> Cancelar</Button>
        </div>
        {functions.data?.find((x) => x.id === f.function_id)?.description?.trim() && <p className="text-sm text-muted-foreground">{functions.data?.find((x) => x.id === f.function_id)?.description}</p>}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Atividade</Label>
            {f.instrument_id ? (
              <div><Chip label={isReg ? `Regência (${sections.data?.find((x) => x.id === f.instrument_id.slice(REGENCIA.length))?.name ?? ''})` : instrumentLabel(f.instrument_id)} onRemove={() => setF({ ...f, instrument_id: '' })} removeLabel="Trocar atividade" /></div>
            ) : (
              <AutoComplete aria-label="Atividade" placeholder="Escreva a atividade (ex.: Surdo)"
                options={[...active(sections.data).map((x) => ({ id: REGENCIA + x.id, label: `Regência (${x.name})`, hint: 'atividade artística' })), ...active(instruments.data).map((i) => ({ id: i.id, label: i.name, hint: sections.data?.find((s) => s.id === i.section_id)?.name }))]}
                onPick={(o) => setF({ ...f, instrument_id: o.id })} />
            )}
          </div>
          {f.instrument_id && !isReg && (
            <div className="space-y-1.5">
              <Label>Nível</Label>
              <Select value={f.skill_level_id} aria-label="Nível" onChange={(e) => setF({ ...f, skill_level_id: e.target.value })}>
                <option value="">Sem nível</option>
                {active(levels.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </div>
          )}
        </>
      )}
      {!collab && (
        <div className="flex gap-2">
          <Button size="sm" disabled={isReg ? addReg.isPending : (collab ? !f.function_id : !f.instrument_id) || save.isPending} onClick={() => (isReg ? addReg.mutate() : save.mutate())}>OK</Button>
          <Button size="sm" variant="outline" onClick={close} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /> Cancelar</Button>
        </div>
      )}
    </div>
  )

  // Sem participação e sem permissão de editar: nada para mostrar.
  if (!canManage && (data?.length ?? 0) === 0 && (regentes.data?.length ?? 0) === 0) return null
  return (
    <MemberSection level={2} title={<span className="inline-flex items-center gap-1.5">{paid ? 'Remunerada' : collab ? 'Colaborativa' : 'Artística'}{canManage && editing === null && (
      <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label={paid ? 'Adicionar participação remunerada' : collab ? 'Adicionar participação colaborativa' : 'Adicionar participação artística'} title="Adicionar" onClick={() => { setF({ ...EMPTY, is_paid: paid }); setEditing('new') }}><Plus className="h-3.5 w-3.5" /></button>
    )}</span>}>
      {data?.filter((l) => (collab ? !!(l.artistic_functions?.name ?? functions.data?.find((x) => x.id === l.function_id)?.name) : !!l.instrument_id)).map((l, idx) => (editing === l.id ? <div key={l.id}>{form}</div> : (
        <div key={l.id} className={cn('flex items-center justify-between gap-2 rounded-md px-2 py-1', idx % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25')}>
          <div className="min-w-0">
            <p className="break-words font-semibold">
              {collab ? (l.artistic_functions?.name ?? functions.data?.find((x) => x.id === l.function_id)?.name) :(l.skill_levels?.name ? `${l.instruments?.name} · ${l.skill_levels.name}` : l.instruments?.name)}
            </p>
            {!collab && <p className="text-muted-foreground">{[l.instruments?.sections?.name].filter(Boolean).join(' · ')}</p>}
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar vínculo" onClick={() => startEdit(l)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Encerrar" title="Encerrar" onClick={() => end.mutate(l.id)}><X className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )))}
      {!collab && (regentes.data ?? []).map((g, i) => (
        <div key={g.id} className={cn('flex items-center justify-between gap-2 rounded-md px-2 py-1', ((data?.length ?? 0) + i) % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25')}>
          <div className="min-w-0">
            <p className="break-words font-semibold">Regência ({sections.data?.find((x) => x.id === g.section_id)?.name ?? ''})</p>
          </div>
          {canManage && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" aria-label="Encerrar regência" title="Encerrar" disabled={endReg.isPending} onClick={() => endReg.mutate(g.id)}><X className="h-4 w-4" /></Button>}
        </div>
      ))}
      {canManage && editing === 'new' && form}
    </MemberSection>
  )
}
