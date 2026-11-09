import { MemberLink } from '@/modules/members/MemberLink'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Network, Pencil, Plus, Save, Settings, Trash2, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
import { SaveInput } from '@/components/shared/ConfirmField'
import { FitText } from '@/components/shared/FitText'
import { TrashDrawer } from '@/components/shared/TrashDrawer'
import { Collapsible } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Button, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { usePersonLabeler } from '@/modules/members/personLabel'
import { NO_PITCH, hasTuning } from '@/modules/repertoire/service'
import { TuningChips } from './TuningChips'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, saveCatalogItem, type CatalogItem, type CatalogTable } from './service'
import { NewSectionSheet } from './NewSectionWizard'
import { Sheet } from '@/components/ui/primitives'
import { byOrder, nextOrder, useOpenSet, useStructureMutations } from './StructureManagers'

type Kind = 'professor' | 'monitor' | 'regente'
type Scope = 'section' | 'subsection' | 'instrument'
interface Assignment { id: string; member_id: string; staff_kind: Kind; section_id: string | null; subsection_id: string | null; instrument_id: string | null; members: { full_name: string; display_name: string | null } | null }

const COL: Record<Scope, string> = { section: 'section_id', subsection: 'subsection_id', instrument: 'instrument_id' }

const KIND_LABEL: Record<Kind, string> = { professor: 'Professor', monitor: 'Monitor', regente: 'Regente' }

/** Equipe de um naipe ou instrumento: chips de quem já está designado e botões para acrescentar (+Professor, +Monitor, +Regente). */
function StaffBlock({ scope, id, canEdit }: { scope: Scope; id: string; canEdit: boolean; kinds?: Kind[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState<Kind | null>(null)
  const labeler = usePersonLabeler()
  const col = COL[scope] as 'section_id' | 'subsection_id' | 'instrument_id'
  const { data } = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('id, member_id, staff_kind, section_id, subsection_id, instrument_id, members(full_name, display_name)')
        .eq('organization_id', orgId).is('valid_to', null).limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as Assignment[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-assignments', orgId] })
  const mine = (data ?? []).filter((a) => a[col] === id)
  const add = useMutation({
    mutationFn: async (v: { member: string; kind: Kind }) => {
      const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: v.member, staff_kind: v.kind, [col]: id })
      if (error) throw error
    },
    onSuccess: () => { refresh(); setAdding(null); toast.success('Pessoa designada.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (a: string) => {
      const { error } = await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', a)
      if (error) throw error
    },
    onSuccess: () => { refresh(); toast.success('Designação encerrada.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (mine.length === 0 && !canEdit) return null
  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(['professor', 'monitor', 'regente'] as const).map((kind) => (
            <Button key={kind} type="button" size="sm" variant={adding === kind ? 'default' : 'outline'} onClick={() => setAdding(adding === kind ? null : kind)}><UserPlus className="h-4 w-4" /> {KIND_LABEL[kind]}</Button>
          ))}
        </div>
      )}
      {adding && (
        <div className="max-w-sm">
          <MemberPicker onlyActive value="" onChange={(m) => { if (m) add.mutate({ member: m, kind: adding }) }} />
        </div>
      )}
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[...mine].sort((a, b) => KIND_LABEL[a.staff_kind].localeCompare(KIND_LABEL[b.staff_kind], 'pt-BR') || labeler(a.members ?? { full_name: '', display_name: null }).localeCompare(labeler(b.members ?? { full_name: '', display_name: null }), 'pt-BR')).map((a) => (
            <Chip key={a.id} label={<><MemberLink id={a.member_id}>{labeler(a.members ?? { full_name: '', display_name: null })}</MemberLink> · {KIND_LABEL[a.staff_kind]}</>} onRemove={canEdit ? () => end.mutate(a.id) : undefined} removeLabel={`Tirar ${a.members?.full_name ?? ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Campo para criar um item (instrumento) dentro de um naipe. */
function AddInline({ placeholder, label, onAdd, pending }: { placeholder: string; label: string; onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState('')
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName('') } }}>
      <Input aria-label={placeholder} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="sm" disabled={!name.trim() || pending}><Plus className="h-4 w-4" /> {label}</Button>
    </form>
  )
}

/** Lápis e lixeira em cima; setas de ordem embaixo. A alça de arrastar fica à esquerda (prop `left` do Collapsible). */
export function Actions({ item, label, idx, total, onUp, onDown, onEdit, onDelete }: {
  item: CatalogItem; label: string; idx: number; total: number
  onUp: () => void; onDown: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${item.name}`} title="Editar" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${label} ${item.name}`} title="Excluir" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir ${item.name}`} disabled={idx <= 0} onClick={onUp}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Descer ${item.name}`} disabled={idx >= total - 1} onClick={onDown}><ArrowDown className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

/** Oficina e vagas por instrumento no ciclo principal (valem só para esse ciclo; o seguinte começa do zero). Linhas zebradas. */
function SectionWorkshop({ insts }: { insts: CatalogItem[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const cycle = useQuery({
    queryKey: ['current-cycle', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cycles').select('id, name').eq('organization_id', orgId).eq('is_current', true).maybeSingle()
      if (error) throw error
      return data as { id: string; name: string } | null
    },
  })
  const caps = useQuery({
    queryKey: ['capacity-edit', orgId, cycle.data?.id],
    enabled: Boolean(cycle.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('instrument_cycle_capacity').select('instrument_id, capacity').eq('organization_id', orgId).eq('cycle_id', cycle.data!.id)
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.instrument_id as string, r.capacity as number]))
    },
  })
  const workshops = useQuery({
    queryKey: ['workshop-edit', orgId, cycle.data?.id],
    enabled: Boolean(cycle.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('instrument_cycle_workshop').select('instrument_id, has_workshop').eq('organization_id', orgId).eq('cycle_id', cycle.data!.id)
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.instrument_id as string, r.has_workshop as boolean]))
    },
  })
  const save = useMutation({
    mutationFn: async (v: { id: string; capacity: number }) => {
      const { error } = await supabase.from('instrument_cycle_capacity')
        .upsert({ organization_id: orgId, instrument_id: v.id, cycle_id: cycle.data!.id, capacity: v.capacity }, { onConflict: 'instrument_id,cycle_id' })
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Vagas atualizadas.'); qc.invalidateQueries({ queryKey: ['capacity-edit', orgId] }); qc.invalidateQueries({ queryKey: ['capacity', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const setWorkshop = useMutation({
    mutationFn: async (v: { id: string; on: boolean }) => {
      const { error } = await supabase.from('instrument_cycle_workshop')
        .upsert({ organization_id: orgId, instrument_id: v.id, cycle_id: cycle.data!.id, has_workshop: v.on }, { onConflict: 'instrument_id,cycle_id' })
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Oficina atualizada.'); qc.invalidateQueries({ queryKey: ['workshop-edit', orgId] }); qc.invalidateQueries({ queryKey: ['workshops', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!cycle.data) return <p className="text-sm text-muted-foreground">Defina o ciclo principal para controlar oficina e vagas.</p>
  const COLS = 'grid grid-cols-[minmax(0,1fr)_3.5rem_6rem] items-center gap-2 px-2 py-1.5'
  return (
    <div className="space-y-1">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className={cn(COLS, 'bg-muted font-semibold text-muted-foreground')}>
          <FitText className="text-sm">Instrumento</FitText><FitText className="text-center text-sm">Oficina</FitText><FitText className="text-sm">Vagas</FitText>
        </div>
        {insts.map((i, k) => (
          <div key={i.id} className={cn(COLS, k % 2 === 1 ? 'bg-muted/60' : 'bg-card')}>
            <FitText>{i.name}</FitText>
            <span className="text-center"><input type="checkbox" className="h-4 w-4" aria-label={`Oficina de ${i.name}`} checked={!!workshops.data?.get(i.id)} onChange={(e) => setWorkshop.mutate({ id: i.id, on: e.target.checked })} /></span>
            <SaveInput className="w-full" aria-label={`Vagas de ${i.name}`} placeholder="Sem limite" value={caps.data?.has(i.id) ? String(caps.data.get(i.id)) : ''}
              onSave={(v) => {
                const n = Number(v)
                if (!Number.isInteger(n) || n < 0) { toast.error('Informe um número inteiro maior ou igual a zero.'); return }
                return save.mutateAsync({ id: i.id, capacity: n })
              }} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Valem para o ciclo {cycle.data.name}. No próximo ciclo, cada oficina e cada limite de vagas são definidos de novo.</p>
    </div>
  )
}

function RenameForm({ name, label, onSave, onCancel }: { name: string; label: string; onSave: (v: string) => void; onCancel: () => void }) {
  return (
    <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault()
      const v = String(new FormData(e.currentTarget).get('name') ?? '').trim()
      if (v && v !== name) onSave(v)
      onCancel()
    }}>
      <Input name="name" aria-label={`Novo nome do ${label}`} defaultValue={name} autoFocus />
      <Button type="submit" size="sm" aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /></Button>
    </form>
  )
}

/** Naipes e instrumentos numa página só, todos com o mesmo padrão. */
export function NaipesPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const instMut = useStructureMutations('instruments')
  const drag = useHoldReorder()
  const open = useOpenSet()
  const filter: FilterValue = EMPTY_FILTER
  // Modo edição por item (lápis): só nele aparecem renomear, afinação, botões de equipe e campos de criar.
  const [editing, setEditing] = useState<Set<string>>(new Set())
  const isEditing = (id: string) => editing.has(id)
  const toggleEdit = (id: string) => setEditing((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const searching = false
  const secMut = useStructureMutations('sections')
  const [creating, setCreating] = useState(false)
  // Itens desativados ficam na Lixeira (menu), não aqui.
  const ordered = (sections.data ?? []).filter((s) => s.is_active).sort(byOrder)

  const view = useMemo(() => (sections.data ?? []).filter((s) => s.is_active).sort(byOrder).map((s) => {
    const insts = (instruments.data ?? []).filter((i) => i.section_id === s.id && i.is_active).sort(byOrder)
    const okI = (i: CatalogItem) => matchesStatus(i.is_active, filter.status) && matchesText(i.name, filter.search)
    const visible = matchesText(s.name, filter.search) || insts.some(okI)
    return { s, insts, okI, show: matchesStatus(s.is_active, filter.status) && visible }
  }).filter((g) => g.show), [sections.data, instruments.data, filter])

  const addNode = useMutation({
    mutationFn: async (v: { table: CatalogTable; name: string; section_id?: string; sort_order: number; tuning?: string | null }) =>
      saveCatalogItem(v.table, orgId, { name: v.name, sort_order: v.sort_order, ...(v.tuning ? { tuning: v.tuning } : {}), ...(v.section_id ? { section_id: v.section_id } : {}) }),
    onSuccess: () => { notifySaved('Criado.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const secName = new Map((sections.data ?? []).map((s) => [s.id, s]))
  const restore = useMutation({
    mutationFn: async (v: { table: CatalogTable; id: string }) => {
      const { error } = await supabase.from(v.table).update({ is_active: true }).eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Restaurado.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const purge = useMutation({
    mutationFn: async (v: { table: CatalogTable; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Excluído de vez.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e))
      ? 'Não dá para excluir de vez: há itens dentro, pessoas, vagas ou músicas ligadas a ele. Deixe na lixeira.' : friendlyError(e)),
  })
  /** A lixeira move para a Lixeira (menu): dá para restaurar ou excluir de vez por lá. */
  const confirmDelete = (table: CatalogTable, item: CatalogItem, what: string) => {
    if (window.confirm(`Mover ${what} “${item.name}” para a Lixeira? Você pode restaurar depois.`)) (table === 'sections' ? secMut : instMut).save.mutate({ id: item.id, name: item.name, is_active: false })
  }

  /** Arrastar um instrumento sobre outro do mesmo naipe reordena. */
  const moveInstrument = (secInsts: CatalogItem[]) => (fromId: string, toId: string) => {
    if (secInsts.some((i) => i.id === fromId) && secInsts.some((i) => i.id === toId)) instMut.reorder.mutate({ from: fromId, to: toId, list: secInsts })
  }

  const instNode = (i: CatalogItem, group: CatalogItem[], secInsts: CatalogItem[], sec: CatalogItem) => {
    const lbl = (sec.item_label ?? 'Instrumento').toLowerCase()
    const idx = group.findIndex((x) => x.id === i.id)
    const onMove = moveInstrument(secInsts)
    const scope = `inst:${i.section_id}`
    return (
      <div key={i.id} {...(canEdit ? drag.row(i.id, onMove, scope) : {})} className={drag.cls(i.id)}>
        <Collapsible below={<StaffBlock scope="instrument" id={i.id} canEdit={canEdit && isEditing(i.id)} />} left={canEdit ? drag.handle(i.id, onMove, scope) : undefined} level={1} expandable={isEditing(i.id)} open={searching || open.isOpen(i.id)} onToggle={() => open.toggle(i.id)} title={<span className={cn(!i.is_active && 'opacity-60')}>{i.name}{hasTuning(i.tuning) ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{i.tuning}</span> : null}</span>}
          right={canEdit && (
            <Actions item={i} label={lbl} idx={idx} total={group.length}
              onUp={() => instMut.move.mutate({ a: i, b: group[idx - 1], list: group })} onDown={() => instMut.move.mutate({ a: i, b: group[idx + 1], list: group })}
              onEdit={() => { toggleEdit(i.id); if (!open.isOpen(i.id) && !isEditing(i.id)) open.toggle(i.id) }}
              onDelete={() => confirmDelete('instruments', i, `o item (${lbl})`)} />
          )}>
          {isEditing(i.id) && <RenameForm name={i.name} label={lbl} onSave={(v) => instMut.save.mutate({ id: i.id, name: v })} onCancel={() => toggleEdit(i.id)} />}
          {isEditing(i.id) && sec.has_tuning !== false && <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-sm font-semibold text-muted-foreground">Afinação</span>
            <TuningChips value={i.tuning ?? null} disabled={!canEdit} onChange={(v) => instMut.save.mutate({ id: i.id, name: i.name, tuning: v })} />
          </div>}
        </Collapsible>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1>Naipes e instrumentos</h1>
          {canEdit && <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Novo naipe" title="Novo naipe" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /></Button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="organograma"><Network className="h-4 w-4" /> Organograma</Link></Button>
          {canEdit && <Button asChild variant="outline"><Link to="configuracoes"><Settings className="h-4 w-4" /> Configurações</Link></Button>}
          {canEdit && (
            <TrashDrawer groups={[
              { label: 'Naipes', entries: (sections.data ?? []).filter((s) => !s.is_active).map((s) => ({ id: s.id, name: s.name })), onRestore: (id) => restore.mutate({ table: 'sections', id }), onPurge: (id) => purge.mutate({ table: 'sections', id }) },
              { label: 'Instrumentos', entries: (instruments.data ?? []).filter((i) => !i.is_active).map((i) => ({ id: i.id, name: i.name, detail: i.section_id ? secName.get(i.section_id)?.name : undefined })), onRestore: (id) => restore.mutate({ table: 'instruments', id }), onPurge: (id) => purge.mutate({ table: 'instruments', id }) },
            ]} />
          )}
        </div>
      </div>
      <Sheet open={creating} onOpenChange={setCreating}>{creating && <NewSectionSheet onClose={() => setCreating(false)} />}</Sheet>
      <p className="text-muted-foreground">
        Os nomes de naipe disponíveis ficam em Organização → Nomes de naipes. Cada naipe tem seus instrumentos. Professores e monitores designados acompanham o que está dentro. Segure a alça (as seis bolinhas) para arrastar:
        mude a ordem. Lembre de conceder também o papel de acesso (Professor/Monitor) em <strong>Acesso e papéis</strong>.
      </p>
      {sections.isLoading && <Skeleton className="h-24" />}
      {sections.data && view.length === 0 && <EmptyState>Nenhum naipe encontrado.</EmptyState>}
      <div className="space-y-2">
        {view.map(({ s, insts, okI }) => {
          const onMoveSec = (f: string, t: string) => secMut.reorder.mutate({ from: f, to: t, list: ordered })
          const idx = ordered.findIndex((x) => x.id === s.id)
          return (
            <div key={s.id} {...(canEdit ? drag.row(s.id, onMoveSec, 'sections') : {})} className={drag.cls(s.id)}>
              <Collapsible below={<StaffBlock scope="section" id={s.id} canEdit={canEdit && isEditing(s.id)} />} left={canEdit ? drag.handle(s.id, onMoveSec, 'sections') : undefined} countFirst expandable={insts.length > 0 || isEditing(s.id)} open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)} title={<span className={cn(!s.is_active && 'opacity-60')}>{s.name}</span>} count={insts.length}
                right={canEdit && (
                  <Actions item={s} label="naipe" idx={idx} total={ordered.length}
                    onUp={() => secMut.move.mutate({ a: s, b: ordered[idx - 1], list: ordered })} onDown={() => secMut.move.mutate({ a: s, b: ordered[idx + 1], list: ordered })}
                    onEdit={() => { toggleEdit(s.id); if (!open.isOpen(s.id) && !isEditing(s.id)) open.toggle(s.id) }}
                    onDelete={() => confirmDelete('sections', s, 'o naipe')} />
                )}>
                {isEditing(s.id) && <RenameForm name={s.name} label="naipe" onSave={(v) => secMut.save.mutate({ id: s.id, name: v })} onCancel={() => toggleEdit(s.id)} />}
                {isEditing(s.id) && insts.length > 0 && <SectionWorkshop insts={insts} />}

                <div className="space-y-1.5">
                  {insts.filter(okI).map((i) => instNode(i, insts, insts, s))}
                  {canEdit && isEditing(s.id) && <AddInline placeholder={`Novo(a) ${(s.item_label ?? 'Instrumento').toLowerCase()} do naipe`} label={s.item_label ?? 'Instrumento'} pending={addNode.isPending}
                    onAdd={(name) => addNode.mutate({ table: 'instruments', name, section_id: s.id, tuning: s.pitch_mode === 'undefined' ? NO_PITCH : null, sort_order: nextOrder(instruments.data ?? []) })} />}
                </div>
              </Collapsible>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado. Só dá para excluir o que nunca foi usado.</p>
    </div>
  )
}
