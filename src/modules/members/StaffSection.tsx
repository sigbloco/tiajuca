import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, Plus, Save, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { MemberSection } from './MemberSection'

export type Compensation = 'paid' | 'collaborative'
export const COMP_LABEL: Record<Compensation, string> = { paid: 'Remunerada', collaborative: 'Colaborativa' }
const KIND_LABEL = { professor: 'Professor', monitor: 'Monitor(a)', regente: 'Regente' } as const
type Kind = keyof typeof KIND_LABEL

/** Símbolo da colaboração: $ (remunerada) ou coração (colaborativa). */
export function CompMark({ value }: { value: Compensation }) {
  return value === 'paid'
    ? <span className="font-bold" title={COMP_LABEL.paid} aria-label={COMP_LABEL.paid}>$</span>
    : <Heart className="inline h-3.5 w-3.5 text-primary" aria-label={COMP_LABEL.collaborative} role="img"><title>{COMP_LABEL.collaborative}</title></Heart>
}

/** Escolha obrigatória: a colaboração é remunerada ou colaborativa. */
export function CompensationPick({ value, onChange }: { value: Compensation | null; onChange: (c: Compensation) => void }) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Tipo de colaboração">
      {(['paid', 'collaborative'] as const).map((c) => (
        <Button key={c} type="button" size="sm" variant={value === c ? 'default' : 'outline'} role="radio" aria-checked={value === c} onClick={() => onChange(c)}>{COMP_LABEL[c]}</Button>
      ))}
    </div>
  )
}

interface Row { id: string; staff_kind: Kind; compensation: Compensation; section_id: string | null; subsection_id: string | null; instrument_id: string | null }

/** Ficha do integrante: as atribuições dele na equipe do ciclo (as mesmas de Naipes e instrumentos), remuneradas ou colaborativas. */
export function StaffSection({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('structure.manage')
  const { cycle } = useSelectedCycle()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<Kind>('professor')
  const [target, setTarget] = useState('')
  const [comp, setComp] = useState<Compensation | null>(null)

  const rows = useQuery({
    queryKey: ['staff-assignments', orgId, 'member', memberId, cycle?.id],
    enabled: Boolean(cycle),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('id, staff_kind, compensation, section_id, subsection_id, instrument_id')
        .eq('organization_id', orgId).eq('member_id', memberId).eq('cycle_id', cycle!.id).is('valid_to', null)
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['staff-assignments'] }); qc.invalidateQueries({ queryKey: ['member-links'] }) }
  const nameOf = (r: Row) =>
    r.instrument_id ? instruments.data?.find((i) => i.id === r.instrument_id)?.name
      : r.subsection_id ? subsections.data?.find((s) => s.id === r.subsection_id)?.name
        : sections.data?.find((s) => s.id === r.section_id)?.name

  const add = useMutation({
    mutationFn: async () => {
      const [type, id] = target.split(':')
      const col = type === 'i' ? 'instrument_id' : type === 's' ? 'subsection_id' : 'section_id'
      const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: memberId, staff_kind: kind, [col]: id, compensation: comp, cycle_id: cycle!.id })
      if (error) throw error
    },
    onSuccess: () => { refresh(); setAdding(false); setTarget(''); setComp(null); notifySaved('Atribuição salva.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const patch = useMutation({
    mutationFn: async (v: { id: string; compensation: Compensation }) => { const { error } = await supabase.from('staff_assignments').update({ compensation: v.compensation }).eq('id', v.id); if (error) throw error },
    onSuccess: () => { refresh(); notifySaved('Atualizado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id); if (error) throw error },
    onSuccess: () => { refresh(); notifySaved('Atribuição encerrada.') },
    onError: (e) => toast.error(friendlyError(e)),
  })

  if (!canManage && (rows.data ?? []).length === 0) return null
  return (
    <MemberSection title={`Equipe${cycle ? ` · ${cycle.name}` : ''}`}>
      <div className="space-y-2">
        {(rows.data ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma atribuição neste ciclo.</p>}
        {(rows.data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
            <span className="min-w-0 flex-1 font-semibold">{KIND_LABEL[r.staff_kind]} · {nameOf(r) ?? ''}</span>
            {canManage ? (
              <>
                <CompensationPick value={r.compensation} onChange={(c) => c !== r.compensation && patch.mutate({ id: r.id, compensation: c })} />
                <Button size="icon" variant="outline" aria-label="Encerrar atribuição" title="Encerrar atribuição" onClick={() => { if (window.confirm('Encerrar esta atribuição?')) end.mutate(r.id) }}><X className="h-4 w-4" /></Button>
              </>
            ) : <span className="text-muted-foreground">{COMP_LABEL[r.compensation]}</span>}
          </div>
        ))}
        {canManage && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Atribuição</Button>}
        {canManage && adding && (
          <div className="space-y-2 rounded-lg border border-border p-2">
            <Select aria-label="Função" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
            <Select aria-label="Naipe ou instrumento" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Escolha o naipe ou instrumento</option>
              <optgroup label="Naipes">{(sections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={`n:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Subnaipes">{(subsections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Instrumentos">{(instruments.data ?? []).filter((i) => i.is_active).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}</optgroup>
            </Select>
            <CompensationPick value={comp} onChange={setComp} />
            <div className="flex gap-2">
              <Button size="icon" aria-label="Salvar atribuição" title="Salvar" disabled={!target || !comp || add.isPending} onClick={() => add.mutate()}><Save className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Cancelar" title="Cancelar" onClick={() => { setAdding(false); setTarget(''); setComp(null) }}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </MemberSection>
  )
}
