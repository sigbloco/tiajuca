import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Ban, CircleCheck, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
import { Collapsible } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Button, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { shortName } from '@/core/format'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { TUNINGS } from '@/modules/repertoire/service'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, saveCatalogItem, type CatalogItem, type CatalogTable } from './service'
import { byOrder, nextOrder, useOpenSet, useStructureMutations } from './StructureManagers'

type Kind = 'professor' | 'monitor'
type Scope = 'section' | 'subsection' | 'instrument'
interface Assignment { id: string; member_id: string; staff_kind: Kind; section_id: string | null; subsection_id: string | null; instrument_id: string | null; members: { full_name: string; display_name: string | null } | null }
type Mut = ReturnType<typeof useStructureMutations>

const COL: Record<Scope, string> = { section: 'section_id', subsection: 'subsection_id', instrument: 'instrument_id' }

/** Professores e monitores de um naipe, subnaipe ou instrumento, em chips. Instrumentos só têm monitores. */
function StaffBlock({ scope, id, canEdit, kinds }: { scope: Scope; id: string; canEdit: boolean; kinds: Kind[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState<Kind | null>(null)
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
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2">
      {kinds.map((kind) => {
        const list = mine.filter((a) => a.staff_kind === kind)
        return (
          <div key={kind} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-sm font-semibold text-muted-foreground">{kind === 'professor' ? 'Professores' : 'Monitores'}</span>
            {list.map((a) => (
              <Chip key={a.id} label={shortName(a.members?.full_name, a.members?.display_name)} onRemove={canEdit ? () => end.mutate(a.id) : undefined} removeLabel={`Tirar ${a.members?.full_name ?? ''}`} />
            ))}
            {list.length === 0 && <span className="text-sm text-muted-foreground">ninguém</span>}
            {canEdit && adding !== kind && (
              <Button size="sm" variant="outline" onClick={() => setAdding(kind)}><UserPlus className="h-4 w-4" /> {kind === 'professor' ? 'Professor' : 'Monitor'}</Button>
            )}
            {adding === kind && (
              <div className="w-full max-w-sm">
                <MemberPicker value="" onChange={(m) => { if (m) add.mutate({ member: m, kind }) }} />
                <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button>
              </div>
            )}
          </div>
        )
      })}
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
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${item.name}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
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
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [renaming, setRenaming] = useState<string | null>(null)
  const searching = filter.search.trim() !== ''

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
        <Collapsible level={1} open={searching || open.isOpen(i.id)} onToggle={() => open.toggle(i.id)} title={<span className={cn(!i.is_active && 'opacity-60')}>{i.name}{i.tuning ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{i.tuning}</span> : null}</span>}
          right={canEdit && (
            <Actions item={i} label="instrumento" idx={idx} total={group.length} handle={drag.handle(i.id, onMove, scope)}
              onUp={() => instMut.move.mutate({ a: i, b: group[idx - 1], list: group })} onDown={() => instMut.move.mutate({ a: i, b: group[idx + 1], list: group })}
              onEdit={() => { setRenaming(renaming === i.id ? null : i.id); if (!open.isOpen(i.id)) open.toggle(i.id) }}
              onToggle={() => toggle(instMut, i)} onDelete={() => confirmDelete('instruments', i, 'o instrumento')} />
          )}>
          {renaming === i.id && <RenameForm name={i.name} label="instrumento" onSave={(v) => instMut.save.mutate({ id: i.id, name: v })} onCancel={() => setRenaming(null)} />}
          {(
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-sm font-semibold text-muted-foreground">Afinação</span>
              {TUNINGS.map((t) => (
                <button key={t} type="button" aria-pressed={i.tuning === t} disabled={!canEdit}
                  onClick={() => instMut.save.mutate({ id: i.id, name: i.name, tuning: i.tuning === t ? null : t })}
                  className={cn('min-h-9 rounded-full border px-3 text-sm font-semibold', i.tuning === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>{t}</button>
              ))}
            </div>
          )}
          <StaffBlock scope="instrument" id={i.id} canEdit={canEdit} kinds={['monitor']} />
        </Collapsible>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h1>Naipes e instrumentos</h1>
      <p className="text-muted-foreground">
        Os naipes são fixos (Sopro, Cordas, Percussão, Performance e Canto); para criar ou mudar naipes, vá em Configurações → Naipes. Cada naipe tem seus subnaipes e instrumentos. Professores e monitores designados acompanham o que está dentro. Segure a alça (as seis bolinhas) para arrastar:
        mude a ordem ou leve um instrumento para outro subnaipe. Lembre de conceder também o papel de acesso (Professor/Monitor) em <strong>Acesso e papéis</strong>.
      </p>
      <FilterBar value={filter} onChange={setFilter} />
      {sections.isLoading && <Skeleton className="h-24" />}
      {sections.data && view.length === 0 && <EmptyState>Nenhum naipe encontrado.</EmptyState>}
      <div className="space-y-2">
        {view.map(({ s, subs, insts, okI }) => {
          const noSub = insts.filter((i) => !i.subsection_id)
          return (
            <div key={s.id}>
              <Collapsible open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)} title={<span className={cn(!s.is_active && 'opacity-60')}>{s.name}</span>} count={insts.length}
                >
                <StaffBlock scope="section" id={s.id} canEdit={canEdit} kinds={['professor', 'monitor']} />

                <div data-sortid={`nosub:${s.id}`} data-sortscope={`inst:${s.id}`} className={cn('space-y-1.5 rounded-lg', drag.cls(`nosub:${s.id}`))}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Instrumentos do naipe</p>
                  {noSub.length === 0 && <p className="text-sm text-muted-foreground">Nenhum instrumento solto no naipe.</p>}
                  {noSub.filter(okI).map((i) => instNode(i, noSub, insts))}
                  {canEdit && <AddInline placeholder="Novo instrumento do naipe" label="Instrumento" pending={addNode.isPending}
                    onAdd={(name) => addNode.mutate({ table: 'instruments', name, section_id: s.id, sort_order: nextOrder(instruments.data ?? []) })} />}
                </div>

                {subs.filter((x) => matchesStatus(x.is_active, filter.status)).map((sub, si) => {
                  const list = insts.filter((i) => i.subsection_id === sub.id)
                  const onMoveSub = (f: string, t: string) => subMut.reorder.mutate({ from: f, to: t, list: subs })
                  return (
                    <div key={sub.id} data-sortid={`sub:${sub.id}`} data-sortscope={`inst:${s.id}`} className={cn('rounded-lg', drag.cls(`sub:${sub.id}`))}>
                      <div {...(canEdit ? drag.row(sub.id, onMoveSub, `sub:${s.id}`) : {})} className={drag.cls(sub.id)}>
                        <Collapsible level={1} open={searching || open.isOpen(sub.id)} onToggle={() => open.toggle(sub.id)} title={<span className={cn(!sub.is_active && 'opacity-60')}>{sub.name}</span>} count={list.length}
                          right={canEdit && (
                            <Actions item={sub} label="subnaipe" idx={si} total={subs.length} handle={drag.handle(sub.id, onMoveSub, `sub:${s.id}`)}
                              onUp={() => subMut.move.mutate({ a: sub, b: subs[si - 1], list: subs })} onDown={() => subMut.move.mutate({ a: sub, b: subs[si + 1], list: subs })}
                              onEdit={() => { setRenaming(renaming === sub.id ? null : sub.id); if (!open.isOpen(sub.id)) open.toggle(sub.id) }}
                              onToggle={() => toggle(subMut, sub)} onDelete={() => confirmDelete('subsections', sub, 'o subnaipe')} />
                          )}>
                          {renaming === sub.id && <RenameForm name={sub.name} label="subnaipe" onSave={(v) => subMut.save.mutate({ id: sub.id, name: v })} onCancel={() => setRenaming(null)} />}
                          <StaffBlock scope="subsection" id={sub.id} canEdit={canEdit} kinds={['professor', 'monitor']} />
                          <div className="space-y-1.5">
                            {list.filter(okI).map((i) => instNode(i, list, insts))}
                            {canEdit && <AddInline placeholder="Novo instrumento deste subnaipe" label="Instrumento" pending={addNode.isPending}
                              onAdd={(name) => addNode.mutate({ table: 'instruments', name, section_id: s.id, subsection_id: sub.id, sort_order: nextOrder(instruments.data ?? []) })} />}
                          </div>
                        </Collapsible>
                      </div>
                    </div>
                  )
                })}
                {canEdit && <AddInline placeholder={`Novo subnaipe de ${s.name}`} label="Subnaipe" pending={addNode.isPending}
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
