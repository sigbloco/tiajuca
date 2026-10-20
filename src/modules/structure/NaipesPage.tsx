import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Ban, CircleCheck, Pencil, Network, Plus, Settings, Trash2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
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
import { hasTuning } from '@/modules/repertoire/service'
import { TuningChips } from './TuningChips'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, saveCatalogItem, type CatalogItem, type CatalogTable } from './service'
import { NewSectionSheet } from './NewSectionWizard'
import { Sheet } from '@/components/ui/primitives'
import { byOrder, nextOrder, useOpenSet, useStructureMutations } from './StructureManagers'

type Kind = 'professor' | 'monitor' | 'regente'
type Scope = 'section' | 'subsection' | 'instrument'
interface Assignment { id: string; member_id: string; staff_kind: Kind; section_id: string | null; subsection_id: string | null; instrument_id: string | null; members: { full_name: string; display_name: string | null } | null }
type Mut = ReturnType<typeof useStructureMutations>

const COL: Record<Scope, string> = { section: 'section_id', subsection: 'subsection_id', instrument: 'instrument_id' }

const KIND_LABEL: Record<Kind, string> = { professor: 'Professor', monitor: 'Monitor', regente: 'Regente' }

/** Equipe de um naipe, subnaipe ou instrumento: chips de quem já está designado e botões para acrescentar (+Professor, +Monitor, +Regente). */
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
            <Chip key={a.id} label={`${labeler(a.members ?? { full_name: '', display_name: null })} · ${KIND_LABEL[a.staff_kind]}`} onRemove={canEdit ? () => end.mutate(a.id) : undefined} removeLabel={`Tirar ${a.members?.full_name ?? ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Campo para criar um item (instrumento ou subnaipe) dentro de um naipe/subnaipe. */
function AddInline({ placeholder, label, onAdd, pending }: { placeholder: string; label: string; onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState('')
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName('') } }}>
      <Input aria-label={placeholder} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="sm" disabled={!name.trim() || pending}><Plus className="h-4 w-4" /> {label}</Button>
    </form>
  )
}

/** Mesmo padrão em todos os itens: alça (6 bolinhas), seta pra cima, seta pra baixo, lápis, "proibido" (desativar) e lixeira. */
export function Actions({ item, label, idx, total, handle, onUp, onDown, onEdit, onToggle, onDelete }: {
  item: CatalogItem; label: string; idx: number; total: number; handle: React.ReactNode
  onUp: () => void; onDown: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center">
      {handle}
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir ${item.name}`} disabled={idx <= 0} onClick={onUp}><ArrowUp className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Descer ${item.name}`} disabled={idx >= total - 1} onClick={onDown}><ArrowDown className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar ${item.name}`} title="Editar" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={cn('h-8 w-8', !item.is_active && 'text-success')} aria-label={`${item.is_active ? 'Desativar' : 'Reativar'} ${label} ${item.name}`} title={item.is_active ? 'Desativar' : 'Reativar'} onClick={onToggle}>
        {item.is_active ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${label} ${item.name}`} title="Excluir" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
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
      <Button type="submit" size="sm">Salvar</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
    </form>
  )
}

/** Naipes, subnaipes e instrumentos numa página só, todos com o mesmo padrão. Arraste um instrumento para outro subnaipe para mudá-lo de lugar. */
export function NaipesPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const subMut = useStructureMutations('subsections')
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
  const ordered = (sections.data ?? []).slice().sort(byOrder)

  const view = useMemo(() => (sections.data ?? []).slice().sort(byOrder).map((s) => {
    const subs = (subsections.data ?? []).filter((x) => x.section_id === s.id).sort(byOrder)
    const insts = (instruments.data ?? []).filter((i) => i.section_id === s.id).sort(byOrder)
    const okI = (i: CatalogItem) => matchesStatus(i.is_active, filter.status) && matchesText(i.name, filter.search)
    const visible = matchesText(s.name, filter.search) || insts.some(okI) || subs.some((x) => matchesText(x.name, filter.search))
    return { s, subs, insts, okI, show: matchesStatus(s.is_active, filter.status) && visible }
  }).filter((g) => g.show), [sections.data, subsections.data, instruments.data, filter])

  const addNode = useMutation({
    mutationFn: async (v: { table: CatalogTable; name: string; section_id?: string; subsection_id?: string | null; sort_order: number }) =>
      saveCatalogItem(v.table, orgId, { name: v.name, sort_order: v.sort_order, ...(v.section_id ? { section_id: v.section_id } : {}), ...(v.subsection_id ? { subsection_id: v.subsection_id } : {}) }),
    onSuccess: () => { notifySaved('Criado.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (v: { table: CatalogTable; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Excluído.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e)) ? 'Não dá para excluir: há itens dentro ou pessoas, vagas e músicas ligadas a ele. Desative em vez de excluir.' : friendlyError(e)),
  })
  const confirmDelete = (table: CatalogTable, item: CatalogItem, what: string) => {
    if (window.confirm(`Excluir ${what} “${item.name}”? Isso não pode ser desfeito. Se ele já foi usado, prefira desativar.`)) del.mutate({ table, id: item.id })
  }
  const toggle = (mut: Mut, item: CatalogItem) => mut.save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })

  /** Arrastar um instrumento: sobre outro instrumento do mesmo grupo reordena; sobre um subnaipe (ou "do naipe") muda de grupo. */
  const moveInstrument = (secInsts: CatalogItem[]) => (fromId: string, toId: string) => {
    const from = secInsts.find((i) => i.id === fromId)
    if (!from) return
    if (toId.startsWith('sub:')) { instMut.save.mutate({ id: from.id, name: from.name, subsection_id: toId.slice(4) }); return }
    if (toId.startsWith('nosub:')) { instMut.save.mutate({ id: from.id, name: from.name, subsection_id: null }); return }
    const to = secInsts.find((i) => i.id === toId)
    if (!to) return
    if ((from.subsection_id ?? null) === (to.subsection_id ?? null)) instMut.reorder.mutate({ from: fromId, to: toId, list: secInsts.filter((i) => (i.subsection_id ?? null) === (from.subsection_id ?? null)) })
    else instMut.save.mutate({ id: from.id, name: from.name, subsection_id: to.subsection_id ?? null })
  }

  const instNode = (i: CatalogItem, group: CatalogItem[], secInsts: CatalogItem[]) => {
    const idx = group.findIndex((x) => x.id === i.id)
    const onMove = moveInstrument(secInsts)
    const scope = `inst:${i.section_id}`
    return (
      <div key={i.id} {...(canEdit ? drag.row(i.id, onMove, scope) : {})} className={drag.cls(i.id)}>
        <Collapsible below={<StaffBlock scope="instrument" id={i.id} canEdit={canEdit && isEditing(i.id)} />} level={1} open={searching || open.isOpen(i.id)} onToggle={() => open.toggle(i.id)} title={<span className={cn(!i.is_active && 'opacity-60')}>{i.name}{hasTuning(i.tuning) ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{i.tuning}</span> : null}</span>}
          right={canEdit && (
            <Actions item={i} label="instrumento" idx={idx} total={group.length} handle={drag.handle(i.id, onMove, scope)}
              onUp={() => instMut.move.mutate({ a: i, b: group[idx - 1], list: group })} onDown={() => instMut.move.mutate({ a: i, b: group[idx + 1], list: group })}
              onEdit={() => { toggleEdit(i.id); if (!open.isOpen(i.id) && !isEditing(i.id)) open.toggle(i.id) }}
              onToggle={() => toggle(instMut, i)} onDelete={() => confirmDelete('instruments', i, 'o instrumento')} />
          )}>
          {isEditing(i.id) && <RenameForm name={i.name} label="instrumento" onSave={(v) => instMut.save.mutate({ id: i.id, name: v })} onCancel={() => toggleEdit(i.id)} />}
          {isEditing(i.id) && <div className="flex flex-wrap items-center gap-1.5">
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
        <h1>Naipes e instrumentos</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="organograma"><Network className="h-4 w-4" /> Organograma</Link></Button>
          {canEdit && <Button asChild variant="outline"><Link to="configuracoes"><Settings className="h-4 w-4" /> Configurações</Link></Button>}
          {canEdit && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo naipe</Button>}
        </div>
      </div>
      <Sheet open={creating} onOpenChange={setCreating}>{creating && <NewSectionSheet onClose={() => setCreating(false)} />}</Sheet>
      <p className="text-muted-foreground">
        Os nomes de naipe disponíveis ficam em Organização → Nomes de naipes. Cada naipe tem seus subnaipes e instrumentos. Professores e monitores designados acompanham o que está dentro. Segure a alça (as seis bolinhas) para arrastar:
        mude a ordem ou leve um instrumento para outro subnaipe. Lembre de conceder também o papel de acesso (Professor/Monitor) em <strong>Acesso e papéis</strong>.
      </p>
      {sections.isLoading && <Skeleton className="h-24" />}
      {sections.data && view.length === 0 && <EmptyState>Nenhum naipe encontrado.</EmptyState>}
      <div className="space-y-2">
        {view.map(({ s, subs, insts, okI }) => {
          const noSub = insts.filter((i) => !i.subsection_id)
          const onMoveSec = (f: string, t: string) => secMut.reorder.mutate({ from: f, to: t, list: ordered })
          const idx = ordered.findIndex((x) => x.id === s.id)
          return (
            <div key={s.id} {...(canEdit ? drag.row(s.id, onMoveSec, 'sections') : {})} className={drag.cls(s.id)}>
              <Collapsible below={<StaffBlock scope="section" id={s.id} canEdit={canEdit && isEditing(s.id)} />} open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)} title={<span className={cn(!s.is_active && 'opacity-60')}>{s.name}</span>} count={insts.length}
                right={canEdit && (
                  <Actions item={s} label="naipe" idx={idx} total={ordered.length} handle={drag.handle(s.id, onMoveSec, 'sections')}
                    onUp={() => secMut.move.mutate({ a: s, b: ordered[idx - 1], list: ordered })} onDown={() => secMut.move.mutate({ a: s, b: ordered[idx + 1], list: ordered })}
                    onEdit={() => { toggleEdit(s.id); if (!open.isOpen(s.id) && !isEditing(s.id)) open.toggle(s.id) }}
                    onToggle={() => toggle(secMut, s)} onDelete={() => confirmDelete('sections', s, 'o naipe')} />
                )}>
                {isEditing(s.id) && <RenameForm name={s.name} label="naipe" onSave={(v) => secMut.save.mutate({ id: s.id, name: v })} onCancel={() => toggleEdit(s.id)} />}

                {(subs.length === 0 || noSub.length > 0) && (
                <div data-sortid={`nosub:${s.id}`} data-sortscope={`inst:${s.id}`} className={cn('space-y-1.5 rounded-lg', drag.cls(`nosub:${s.id}`))}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{subs.length > 0 ? 'Sem subnaipe (arraste cada um para um subnaipe)' : 'Instrumentos do naipe'}</p>
                  {noSub.filter(okI).map((i) => instNode(i, noSub, insts))}
                  {canEdit && isEditing(s.id) && subs.length === 0 && <AddInline placeholder="Novo instrumento do naipe" label="Instrumento" pending={addNode.isPending}
                    onAdd={(name) => addNode.mutate({ table: 'instruments', name, section_id: s.id, sort_order: nextOrder(instruments.data ?? []) })} />}
                </div>
                )}

                {subs.filter((x) => matchesStatus(x.is_active, filter.status)).map((sub, si) => {
                  const list = insts.filter((i) => i.subsection_id === sub.id)
                  const onMoveSub = (f: string, t: string) => subMut.reorder.mutate({ from: f, to: t, list: subs })
                  return (
                    <div key={sub.id} data-sortid={`sub:${sub.id}`} data-sortscope={`inst:${s.id}`} className={cn('rounded-lg', drag.cls(`sub:${sub.id}`))}>
                      <div {...(canEdit ? drag.row(sub.id, onMoveSub, `sub:${s.id}`) : {})} className={drag.cls(sub.id)}>
                        <Collapsible below={<StaffBlock scope="subsection" id={sub.id} canEdit={canEdit && isEditing(sub.id)} />} level={1} open={searching || open.isOpen(sub.id)} onToggle={() => open.toggle(sub.id)} title={<span className={cn(!sub.is_active && 'opacity-60')}>{sub.name}</span>} count={list.length}
                          right={canEdit && (
                            <Actions item={sub} label="subnaipe" idx={si} total={subs.length} handle={drag.handle(sub.id, onMoveSub, `sub:${s.id}`)}
                              onUp={() => subMut.move.mutate({ a: sub, b: subs[si - 1], list: subs })} onDown={() => subMut.move.mutate({ a: sub, b: subs[si + 1], list: subs })}
                              onEdit={() => { toggleEdit(sub.id); if (!open.isOpen(sub.id) && !isEditing(sub.id)) open.toggle(sub.id) }}
                              onToggle={() => toggle(subMut, sub)} onDelete={() => confirmDelete('subsections', sub, 'o subnaipe')} />
                          )}>
                          {isEditing(sub.id) && <RenameForm name={sub.name} label="subnaipe" onSave={(v) => subMut.save.mutate({ id: sub.id, name: v })} onCancel={() => toggleEdit(sub.id)} />}
                          <div className="space-y-1.5">
                            {list.filter(okI).map((i) => instNode(i, list, insts))}
                            {canEdit && isEditing(sub.id) && <AddInline placeholder="Novo instrumento deste subnaipe" label="Instrumento" pending={addNode.isPending}
                              onAdd={(name) => addNode.mutate({ table: 'instruments', name, section_id: s.id, subsection_id: sub.id, sort_order: nextOrder(instruments.data ?? []) })} />}
                          </div>
                        </Collapsible>
                      </div>
                    </div>
                  )
                })}
                {canEdit && isEditing(s.id) && <AddInline placeholder={`Novo subnaipe de ${s.name}`} label="Subnaipe" pending={addNode.isPending}
                  onAdd={(name) => addNode.mutate({ table: 'subsections', name, section_id: s.id, sort_order: nextOrder(subsections.data ?? []) })} />}
              </Collapsible>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado. Só dá para excluir o que nunca foi usado.</p>
    </div>
  )
}
