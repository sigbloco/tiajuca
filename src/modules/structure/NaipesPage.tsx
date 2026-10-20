import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Plus, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
import { Collapsible } from '@/components/shared/Collapsible'
import { OkSelect } from '@/components/shared/ConfirmField'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
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
import { invalidateCatalog, saveCatalogItem, type CatalogItem } from './service'
import { ItemRow, byOrder, nextOrder, useOpenSet, useStructureMutations } from './StructureManagers'

type Kind = 'professor' | 'monitor'
interface Assignment { id: string; member_id: string; staff_kind: Kind; section_id: string | null; subsection_id: string | null; members: { full_name: string; display_name: string | null } | null }

/** Professores e monitores de um naipe ou subnaipe, em chips. "+ Professor" / "+ Monitor" abre a busca de pessoas. */
function StaffBlock({ scope, id, canEdit }: { scope: 'section' | 'subsection'; id: string; canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState<Kind | null>(null)
  const col = scope === 'section' ? 'section_id' : 'subsection_id'
  const { data } = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('id, member_id, staff_kind, section_id, subsection_id, members(full_name, display_name)')
        .eq('organization_id', orgId).is('valid_to', null).limit(2000)
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
      {(['professor', 'monitor'] as const).map((kind) => {
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

/** Cria um instrumento direto no naipe (ou no subnaipe). */
function AddInstrument({ sectionId, subsectionId, canEdit }: { sectionId: string; subsectionId?: string; canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const instruments = useCatalog('instruments')
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => saveCatalogItem('instruments', orgId, { name: name.trim(), section_id: sectionId, subsection_id: subsectionId ?? null, sort_order: nextOrder(instruments.data ?? []) }),
    onSuccess: () => { setName(''); invalidateCatalog(qc, orgId); notifySaved('Instrumento criado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!canEdit) return null
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate() }}>
      <Input aria-label="Novo instrumento" placeholder={subsectionId ? 'Novo instrumento deste subnaipe' : 'Novo instrumento do naipe'} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" size="sm" disabled={!name.trim() || add.isPending}><Plus className="h-4 w-4" /> Instrumento</Button>
    </form>
  )
}

/** Naipes, subnaipes e instrumentos numa página só. Cada naipe/subnaipe tem sua equipe (professores e monitores). */
export function NaipesPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const secMut = useStructureMutations('sections')
  const subMut = useStructureMutations('subsections')
  const instMut = useStructureMutations('instruments')
  const drag = useHoldReorder()
  const open = useOpenSet()
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [newSection, setNewSection] = useState('')
  const [newSub, setNewSub] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const searching = filter.search.trim() !== ''
  const ordered = (sections.data ?? []).slice().sort(byOrder)

  const view = useMemo(() => (sections.data ?? []).slice().sort(byOrder).map((s) => {
    const subs = (subsections.data ?? []).filter((x) => x.section_id === s.id).sort(byOrder)
    const insts = (instruments.data ?? []).filter((i) => i.section_id === s.id).sort(byOrder)
    const okI = (i: CatalogItem) => matchesStatus(i.is_active, filter.status) && matchesText(i.name, filter.search)
    const visible = matchesText(s.name, filter.search) || insts.some(okI) || subs.some((x) => matchesText(x.name, filter.search))
    return { s, subs, insts, okI, show: matchesStatus(s.is_active, filter.status) && visible }
  }).filter((g) => g.show), [sections.data, subsections.data, instruments.data, filter])

  const addNode = useMutation({
    mutationFn: async (v: { kind: 'section' | 'sub'; sectionId?: string; name: string }) => v.kind === 'section'
      ? saveCatalogItem('sections', orgId, { name: v.name, sort_order: nextOrder(sections.data ?? []) })
      : saveCatalogItem('subsections', orgId, { name: v.name, section_id: v.sectionId, sort_order: nextOrder(subsections.data ?? []) }),
    onSuccess: (_id, v) => {
      notifySaved(v.kind === 'section' ? 'Naipe criado.' : 'Subnaipe criado.')
      if (v.kind === 'section') setNewSection(''); else setNewSub((m) => ({ ...m, [v.sectionId!]: '' }))
      invalidateCatalog(qc, orgId)
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const instRow = (i: CatalogItem, list: CatalogItem[], subs: CatalogItem[]) => (
    <ItemRow key={i.id} item={i} siblings={list} canEdit={canEdit} mut={instMut}
      extra={(
        <>
          <OkSelect className="h-9 w-24" aria-label={`Afinação de ${i.name} (opcional)`} disabled={!canEdit} value={i.tuning ?? ''}
            onSave={(v) => instMut.save.mutateAsync({ id: i.id, name: i.name, tuning: v || null })}>
            <option value="">Afinação</option>
            {TUNINGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </OkSelect>
          {subs.length > 0 && (
            <OkSelect className="h-9 w-36" aria-label={`Subnaipe de ${i.name} (opcional)`} disabled={!canEdit} value={i.subsection_id ?? ''}
              onSave={(v) => instMut.save.mutateAsync({ id: i.id, name: i.name, subsection_id: v || null })}>
              <option value="">Sem subnaipe</option>
              {subs.filter((x) => x.is_active || x.id === i.subsection_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </OkSelect>
          )}
        </>
      )} />
  )

  return (
    <div className="space-y-3">
      <h1>Naipes e instrumentos</h1>
      <p className="text-muted-foreground">
        Cada naipe tem seus subnaipes e instrumentos. Professores e monitores designados a um naipe ou subnaipe acompanham todos os instrumentos dele.
        Segure a alça e arraste para mudar a ordem. Lembre de conceder também o papel de acesso (Professor/Monitor) em <strong>Acesso e papéis</strong>.
      </p>
      {canEdit && (
        <Card className="flex gap-2 p-3">
          <Input placeholder="Novo naipe" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <Button disabled={!newSection.trim() || addNode.isPending} onClick={() => addNode.mutate({ kind: 'section', name: newSection.trim() })}><Plus className="h-4 w-4" /> Naipe</Button>
        </Card>
      )}
      <FilterBar value={filter} onChange={setFilter} />
      {sections.isLoading && <Skeleton className="h-24" />}
      {sections.data && view.length === 0 && <EmptyState>Nenhum naipe encontrado.</EmptyState>}
      <div className="space-y-2">
        {view.map(({ s, subs, insts, okI }) => {
          const onMove = (f: string, t: string) => secMut.reorder.mutate({ from: f, to: t, list: ordered })
          const idx = ordered.findIndex((x) => x.id === s.id)
          const noSub = insts.filter((i) => !i.subsection_id)
          return (
            <div key={s.id} {...(canEdit ? drag.row(s.id, onMove, 'sections') : {})} className={drag.cls(s.id)}>
              <Collapsible open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)} title={<span className={cn(!s.is_active && 'opacity-60')}>{s.name}</span>} count={insts.length}
                right={canEdit && (
                  <div className="flex items-center gap-1">
                    {drag.handle(s.id, onMove, 'sections')}
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir ${s.name}`} disabled={idx <= 0} onClick={() => secMut.move.mutate({ a: s, b: ordered[idx - 1], list: ordered })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Descer ${s.name}`} disabled={idx === ordered.length - 1} onClick={() => secMut.move.mutate({ a: s, b: ordered[idx + 1], list: ordered })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${s.name}`} onClick={() => setRenaming(renaming === s.id ? null : s.id)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => secMut.save.mutate({ id: s.id, name: s.name, is_active: !s.is_active })}>{s.is_active ? 'Desativar' : 'Ativar'}</Button>
                  </div>
                )}>
                {renaming === s.id && (
                  <form className="flex gap-2" onSubmit={(e) => {
                    e.preventDefault()
                    const v = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                    if (v && v !== s.name) secMut.save.mutate({ id: s.id, name: v })
                    setRenaming(null)
                  }}>
                    <Input name="name" aria-label="Novo nome do naipe" defaultValue={s.name} autoFocus />
                    <Button type="submit" size="sm">Salvar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancelar</Button>
                  </form>
                )}
                <StaffBlock scope="section" id={s.id} canEdit={canEdit} />

                <div className="space-y-1.5">
                  {noSub.length > 0 && <p className="text-xs font-semibold uppercase text-muted-foreground">Instrumentos do naipe</p>}
                  {noSub.filter(okI).map((i) => instRow(i, noSub, subs))}
                  <AddInstrument sectionId={s.id} canEdit={canEdit} />
                </div>

                {subs.filter((x) => matchesStatus(x.is_active, filter.status)).map((sub) => {
                  const list = insts.filter((i) => i.subsection_id === sub.id)
                  return (
                    <Collapsible key={sub.id} level={1} open={searching || open.isOpen(sub.id)} onToggle={() => open.toggle(sub.id)} title={<span className={cn(!sub.is_active && 'opacity-60')}>{sub.name}</span>} count={list.length}>
                      <ItemRow item={sub} siblings={subs} canEdit={canEdit} mut={subMut} />
                      <StaffBlock scope="subsection" id={sub.id} canEdit={canEdit} />
                      <div className="space-y-1.5">
                        {list.filter(okI).map((i) => instRow(i, list, subs))}
                        <AddInstrument sectionId={s.id} subsectionId={sub.id} canEdit={canEdit} />
                      </div>
                    </Collapsible>
                  )
                })}
                {canEdit && (
                  <div className="flex gap-2">
                    <Input placeholder={`Novo subnaipe de ${s.name}`} value={newSub[s.id] ?? ''} onChange={(e) => setNewSub({ ...newSub, [s.id]: e.target.value })} />
                    <Button size="sm" disabled={!(newSub[s.id] ?? '').trim() || addNode.isPending} onClick={() => addNode.mutate({ kind: 'sub', sectionId: s.id, name: (newSub[s.id] ?? '').trim() })}><Plus className="h-4 w-4" /> Subnaipe</Button>
                  </div>
                )}
              </Collapsible>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado.</p>
    </div>
  )
}
