import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { useCatalog } from './CatalogEditor'
import { saveCatalogItem, swapOrder, type CatalogItem, type CatalogTable } from './service'

const byOrder = (a: CatalogItem, b: CatalogItem) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
const nextOrder = (items: CatalogItem[]) => items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1

function useStructureMutations(table: CatalogTable) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['catalog', orgId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))
  const save = useMutation({
    mutationFn: (item: Partial<CatalogItem> & { name: string }) => saveCatalogItem(table, orgId, item),
    onSuccess: refresh, onError,
  })
  const move = useMutation({
    mutationFn: ({ a, b }: { a: CatalogItem; b: CatalogItem }) => swapOrder(table, orgId, a, b),
    onSuccess: refresh, onError,
  })
  return { save, move }
}

/** Linha editável: nome inline, setas de ordem, ativar/desativar e um slot extra. */
function ItemRow({ item, siblings, canEdit, mut, extra }: {
  item: CatalogItem
  siblings: CatalogItem[]
  canEdit: boolean
  mut: ReturnType<typeof useStructureMutations>
  extra?: React.ReactNode
}) {
  const idx = siblings.findIndex((s) => s.id === item.id)
  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg bg-background p-1.5', !item.is_active && 'opacity-60')}>
      <div className="flex flex-col">
        <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={!canEdit || idx <= 0}
          onClick={() => mut.move.mutate({ a: item, b: siblings[idx - 1] })}><ArrowUp className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={!canEdit || idx === siblings.length - 1}
          onClick={() => mut.move.mutate({ a: item, b: siblings[idx + 1] })}><ArrowDown className="h-3.5 w-3.5" /></Button>
      </div>
      <Input className="h-9 flex-1 border-transparent bg-transparent font-semibold" defaultValue={item.name} disabled={!canEdit}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && v !== item.name) mut.save.mutate({ id: item.id, name: v })
          else e.target.value = item.name
        }} />
      {extra}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => mut.save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })}>
          {item.is_active ? 'Desativar' : 'Ativar'}
        </Button>
      )}
    </div>
  )
}

function useOpenSet() {
  const [open, setOpen] = useState<Set<string>>(new Set()) // todos nascem fechados
  return {
    isOpen: (k: string) => open.has(k),
    toggle: (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }),
  }
}

/** Naipes e, dentro de cada um, seus subnaipes (agrupados, fechados por padrão). */
export function SectionsManager({ canEdit }: { canEdit: boolean }) {
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const secMut = useStructureMutations('sections')
  const subMut = useStructureMutations('subsections')
  const open = useOpenSet()
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [newSection, setNewSection] = useState('')
  const [newSub, setNewSub] = useState<Record<string, string>>({})
  const searching = filter.search.trim() !== ''

  const view = useMemo(() => {
    const secs = [...(sections.data ?? [])].sort(byOrder)
    return secs.map((s) => {
      const subs = (subsections.data ?? []).filter((x) => x.section_id === s.id).sort(byOrder)
      const secMatch = matchesText(s.name, filter.search)
      const visibleSubs = subs.filter((x) => matchesStatus(x.is_active, filter.status) && (secMatch || matchesText(x.name, filter.search)))
      const show = matchesStatus(s.is_active, filter.status) && (secMatch || visibleSubs.length > 0)
      return { s, subs, visibleSubs, show, instrumentCount: (instruments.data ?? []).filter((i) => i.section_id === s.id).length }
    }).filter((g) => g.show)
  }, [sections.data, subsections.data, instruments.data, filter])

  const orgId = useOrgId()
  const qc = useQueryClient()
  const add = useMutation({
    mutationFn: async (v: { kind: 'section' | 'sub'; sectionId?: string; name: string }) => {
      if (v.kind === 'section') await saveCatalogItem('sections', orgId, { name: v.name, sort_order: nextOrder(sections.data ?? []) })
      else await saveCatalogItem('subsections', orgId, { name: v.name, section_id: v.sectionId, sort_order: nextOrder(subsections.data ?? []) })
    },
    onSuccess: (_d, v) => {
      toast.success(v.kind === 'section' ? 'Naipe criado.' : 'Subnaipe criado.')
      if (v.kind === 'section') setNewSection(''); else setNewSub((m) => ({ ...m, [v.sectionId!]: '' }))
      qc.invalidateQueries({ queryKey: ['catalog', orgId] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-3">
      <h2>Naipes</h2>
      <p className="text-muted-foreground">Grandes grupos (ex.: Percussão, Sopro, Performance). Cada naipe pode ter subnaipes (ex.: Graves, Leves, Agudos), que só a equipe enxerga: alunos e integrantes não.</p>
      {canEdit && (
        <Card className="flex gap-2 p-3">
          <Input placeholder="Novo naipe" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
          <Button disabled={!newSection.trim() || add.isPending} onClick={() => add.mutate({ kind: 'section', name: newSection.trim() })}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      <FilterBar value={filter} onChange={setFilter} />
      {sections.isLoading && <Skeleton className="h-24" />}
      {sections.data && view.length === 0 && <EmptyState>Nenhum naipe encontrado.</EmptyState>}
      <div className="space-y-2">
        {view.map(({ s, subs, visibleSubs, instrumentCount }) => (
          <Collapsible key={s.id} open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)}
            title={<span className={cn(!s.is_active && 'opacity-60')}>{s.name}</span>} count={subs.length}
            right={<span className="hidden text-xs text-muted-foreground sm:inline">{instrumentCount} instrumento(s)</span>}>
            <ItemRow item={s} siblings={(sections.data ?? []).slice().sort(byOrder)} canEdit={canEdit} mut={secMut} />
            <p className="px-1 text-xs font-semibold uppercase text-muted-foreground">Subnaipes</p>
            {visibleSubs.length === 0 && <p className="px-1 text-muted-foreground">Nenhum subnaipe.</p>}
            {visibleSubs.map((x) => <ItemRow key={x.id} item={x} siblings={subs} canEdit={canEdit} mut={subMut} />)}
            {canEdit && (
              <div className="flex gap-2">
                <Input placeholder={`Novo subnaipe de ${s.name}`} value={newSub[s.id] ?? ''} onChange={(e) => setNewSub({ ...newSub, [s.id]: e.target.value })} />
                <Button size="sm" disabled={!(newSub[s.id] ?? '').trim() || add.isPending}
                  onClick={() => add.mutate({ kind: 'sub', sectionId: s.id, name: (newSub[s.id] ?? '').trim() })}><Plus className="h-4 w-4" /> Subnaipe</Button>
              </div>
            )}
          </Collapsible>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado.</p>
    </div>
  )
}

/** Instrumentos agrupados por naipe → subnaipe (grupos fechados por padrão). */
export function InstrumentsManager({ canEdit }: { canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const mut = useStructureMutations('instruments')
  const open = useOpenSet()
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [sectionFilter, setSectionFilter] = useState('')
  const [subFilter, setSubFilter] = useState('') // '' = todos, 'none' = sem subnaipe, id = específico
  const [form, setForm] = useState({ name: '', section_id: '', subsection_id: '' })
  const searching = filter.search.trim() !== ''

  const groups = useMemo(() => {
    const secs = [...(sections.data ?? [])].sort(byOrder).filter((s) => !sectionFilter || s.id === sectionFilter)
    return secs.map((s) => {
      const all = (instruments.data ?? []).filter((i) => i.section_id === s.id).sort(byOrder)
      const passes = (i: CatalogItem) =>
        matchesStatus(i.is_active, filter.status) && matchesText(i.name, filter.search) &&
        (!subFilter || (subFilter === 'none' ? !i.subsection_id : i.subsection_id === subFilter))
      const subs = (subsections.data ?? []).filter((x) => x.section_id === s.id).sort(byOrder)
      const subGroups = [
        ...subs.map((x) => ({ key: x.id, label: x.name, items: all.filter((i) => i.subsection_id === x.id && passes(i)), sub: x as CatalogItem | null })),
        { key: `${s.id}:none`, label: 'Sem subnaipe', items: all.filter((i) => !i.subsection_id && passes(i)), sub: null },
      ].filter((g) => g.items.length > 0)
      return { s, all, subs, subGroups, total: subGroups.reduce((n, g) => n + g.items.length, 0) }
    }).filter((g) => g.total > 0 || (!searching && filter.status === 'all' && !subFilter && g.all.length === 0 && !sectionFilter))
  }, [sections.data, subsections.data, instruments.data, filter, sectionFilter, subFilter, searching])

  const add = useMutation({
    mutationFn: () => saveCatalogItem('instruments', orgId, {
      name: form.name.trim(), section_id: form.section_id, subsection_id: form.subsection_id || null,
      sort_order: nextOrder(instruments.data ?? []),
    }),
    onSuccess: () => { toast.success('Instrumento criado.'); setForm({ ...form, name: '' }); qc.invalidateQueries({ queryKey: ['catalog', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const extraCount = (sectionFilter ? 1 : 0) + (subFilter ? 1 : 0)
  const formSubs = (subsections.data ?? []).filter((x) => x.section_id === form.section_id && x.is_active)

  return (
    <div className="space-y-3">
      <h2>Instrumentos</h2>
      <p className="text-muted-foreground">Agrupados por naipe e subnaipe. Vagas e acompanhamento da equipe valem por instrumento.</p>
      {canEdit && (
        <Card className="grid gap-2 p-3 sm:grid-cols-4">
          <Input className="sm:col-span-1" placeholder="Novo instrumento" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select aria-label="Naipe" value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value, subsection_id: '' })}>
            <option value="">Naipe…</option>
            {sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Subnaipe" disabled={!form.section_id} value={form.subsection_id} onChange={(e) => setForm({ ...form, subsection_id: e.target.value })}>
            <option value="">Subnaipe (opcional)</option>
            {formSubs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Button disabled={!form.name.trim() || !form.section_id || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      <FilterBar value={filter} onChange={setFilter} extraCount={extraCount} onClearExtra={() => { setSectionFilter(''); setSubFilter('') }}>
        <Select aria-label="Naipe" value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setSubFilter('') }}>
          <option value="">Todos os naipes</option>
          {sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select aria-label="Subnaipe" value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
          <option value="">Todos os subnaipes</option>
          <option value="none">Sem subnaipe</option>
          {subsections.data?.filter((x) => !sectionFilter || x.section_id === sectionFilter).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </FilterBar>

      {instruments.isLoading && <Skeleton className="h-24" />}
      {instruments.data && groups.length === 0 && <EmptyState>Nenhum instrumento encontrado.</EmptyState>}
      <div className="space-y-2">
        {groups.map(({ s, subs, subGroups, total }) => (
          <Collapsible key={s.id} open={searching || open.isOpen(s.id)} onToggle={() => open.toggle(s.id)} title={s.name} count={total}>
            {subGroups.length === 0 && <p className="text-muted-foreground">Nenhum instrumento neste naipe.</p>}
            {subGroups.map((g) => (
              <Collapsible key={g.key} level={1} open={searching || open.isOpen(g.key)} onToggle={() => open.toggle(g.key)} title={g.label} count={g.items.length}>
                {g.items.map((i) => (
                  <ItemRow key={i.id} item={i} siblings={g.items} canEdit={canEdit} mut={mut}
                    extra={
                      <Select className="h-9 w-36" aria-label={`Subnaipe de ${i.name}`} disabled={!canEdit} value={i.subsection_id ?? ''}
                        onChange={(e) => mut.save.mutate({ id: i.id, name: i.name, subsection_id: e.target.value || null })}>
                        <option value="">Sem subnaipe</option>
                        {subs.filter((x) => x.is_active || x.id === i.subsection_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </Select>
                    } />
                ))}
              </Collapsible>
            ))}
          </Collapsible>
        ))}
      </div>
    </div>
  )
}
