import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProgressive } from '@/components/shared/LoadMore'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { COLOR_LABEL, type TypeColor } from '@/modules/events/service'
import { OkSelect, SaveInput } from '@/components/shared/ConfirmField'
import { notifySaved } from '@/core/undo'
import { useHoldReorder } from '@/core/holdReorder'
import { mirrorFunctionToFees, describeChange, moveItemTo, invalidateCatalog, listCatalog, previousOf, saveCatalogItem, swapOrder, type CatalogItem, type CatalogTable } from './service'

interface Props {
  table: CatalogTable
  title: string
  singular: string
  /** Exige escolher o naipe (subnaipes e instrumentos). */
  withSection?: boolean
  /** Permite escolher um subnaipe opcional (instrumentos). */
  withSubsection?: boolean
  hint?: string
  /** Mostra seletor de cor (tipos de evento). */
  withColor?: boolean
  canEdit: boolean
  /** Ordem alfabética fixa (sem setas nem arrastar): para listas que só alimentam menus de escolha. */
  alphabetical?: boolean
  /** Sem busca nem filtro de situação. */
  noFilter?: boolean
  /** O que for criado/renomeado/ativado aqui se reflete em Contribuições (categorias de mensalidade). */
  mirrorFees?: boolean
}

export function useCatalog(table: CatalogTable) {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['catalog', orgId, table], queryFn: () => listCatalog(table, orgId) })
}

/** Editor genérico de catálogo configurável: criar, renomear, reordenar, ativar/desativar (nunca excluir). */
export function CatalogEditor({ table, title, singular, withSection, withSubsection, withColor, hint, canEdit, alphabetical, noFilter, mirrorFees }: Props) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: items, isLoading } = useCatalog(table)
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const [name, setName] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subsectionId, setSubsectionId] = useState('')
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const visible = (items ?? []).filter((i) => matchesStatus(i.is_active, filter.status) && matchesText(i.name, filter.search))
    .sort((a, b) => (alphabetical ? a.name.localeCompare(b.name, 'pt-BR') : 0))
  const prog = useProgressive(visible, 5, filter.search)

  const refresh = () => invalidateCatalog(qc, orgId)
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const add = useMutation({
    mutationFn: () =>
      saveCatalogItem(table, orgId, {
        name: name.trim(),
        sort_order: (items?.reduce((m, i) => Math.max(m, i.sort_order), 0) ?? 0) + 1,
        ...(withSection ? { section_id: sectionId } : {}),
        ...(withSubsection && subsectionId ? { subsection_id: subsectionId } : {}),
      }),
    onSuccess: (id) => {
      if (mirrorFees) void mirrorFunctionToFees(orgId, { created: name.trim() }).then(() => qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }))
      setName('')
      refresh()
      notifySaved(`${singular} criado.`, id ? async () => { await saveCatalogItem(table, orgId, { id, name: name.trim(), is_active: false }); refresh() } : undefined)
    },
    onError,
  })
  const save = useMutation({
    mutationFn: async (item: Partial<CatalogItem> & { name: string }) => ({ prev: previousOf(items, item), id: await saveCatalogItem(table, orgId, item) }),
    onSuccess: ({ prev }, item) => {
      if (mirrorFees && prev) {
        if (item.name !== prev.name) void mirrorFunctionToFees(orgId, { renamed: { from: prev.name, to: item.name } })
        if (item.is_active !== undefined && item.is_active !== prev.is_active) void mirrorFunctionToFees(orgId, { active: { name: item.name, value: item.is_active } })
      }
      refresh()
      notifySaved(item.name !== prev?.name && prev ? 'Nome atualizado.' : describeChange(item, singular),
        prev ? async () => { await saveCatalogItem(table, orgId, prev); refresh() } : undefined)
    },
    onError,
  })
  const reorder = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moveItemTo(table, orgId, items ?? [], from, to),
    onSuccess: () => refresh(),
    onError,
  })
  const drag = useHoldReorder()
  const onDragMove = (from: string, to: string) => reorder.mutate({ from, to })
  const move = useMutation({
    mutationFn: ({ a, b, list }: { a: CatalogItem; b: CatalogItem; list: CatalogItem[] }) => swapOrder(table, orgId, a, b, list),
    onSuccess: () => refresh(),
    onError,
  })

  const nameOf = (list: CatalogItem[] | undefined, id?: string | null) => list?.find((x) => x.id === id)?.name
  const canAdd = name.trim() && (!withSection || sectionId)

  return (
    <div className="space-y-3">
      <h2>{title}</h2>
      {hint && <p className="text-muted-foreground">{hint}</p>}
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <Input className="min-w-40 flex-1" placeholder={`Novo(a) ${singular.toLowerCase()}`} value={name} onChange={(e) => setName(e.target.value)} />
          {withSection && (
            <Select className="w-44" value={sectionId} aria-label="Naipe" onChange={(e) => { setSectionId(e.target.value); setSubsectionId('') }}>
              <option value="">Naipe…</option>
              {sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          {withSubsection && (
            <Select className="w-44" value={subsectionId} aria-label="Subnaipe" disabled={!sectionId} onChange={(e) => setSubsectionId(e.target.value)}>
              <option value="">Subnaipe (opcional)</option>
              {subsections.data?.filter((s) => s.is_active && s.section_id === sectionId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Button disabled={!canAdd || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}

      {!noFilter && <FilterBar value={filter} onChange={setFilter} />}
      {isLoading && <Skeleton className="h-24" />}
      {items && visible.length === 0 && <EmptyState>{items.length === 0 ? 'Nada cadastrado ainda.' : 'Nenhum item encontrado.'}</EmptyState>}
      <div className="grid gap-2">
        {prog.visible.map((item, idx) => (
          <Card key={item.id} {...(canEdit && !alphabetical ? drag.row(item.id, onDragMove) : {})} className={cn('flex items-center gap-2 p-2', !item.is_active && 'opacity-60', drag.cls(item.id))}>
            {canEdit && !alphabetical && drag.handle(item.id, onDragMove)}
            {!alphabetical && <div className="flex flex-col">
              <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Subir" disabled={!canEdit || idx === 0}
                onClick={() => move.mutate({ a: item, b: visible[idx - 1], list: visible })}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Descer" disabled={!canEdit || idx === visible.length - 1}
                onClick={() => move.mutate({ a: item, b: visible[idx + 1], list: visible })}><ArrowDown className="h-4 w-4" /></Button>
            </div>}
            <SaveInput value={item.name} disabled={!canEdit} aria-label={`Nome de ${item.name}`}
              onSave={(v) => save.mutateAsync({ id: item.id, name: v })} />
            {withSection && <Badge className="hidden sm:inline-flex">{nameOf(sections.data, item.section_id)}</Badge>}
            {withSubsection && (
              <OkSelect
                className="h-9 w-36"
                aria-label="Subnaipe do instrumento"
                disabled={!canEdit}
                value={item.subsection_id ?? ''}
                onSave={(v) => save.mutateAsync({ id: item.id, name: item.name, subsection_id: v || null })}
              >
                <option value="">Sem subnaipe</option>
                {subsections.data?.filter((x) => x.section_id === item.section_id && (x.is_active || x.id === item.subsection_id))
                  .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </OkSelect>
            )}
            {withColor && (
              <OkSelect className="h-9 w-40" aria-label="Cor" disabled={!canEdit} value={item.color ?? 'primary'}
                onSave={(v) => save.mutateAsync({ id: item.id, name: item.name, color: v })}>
                {(Object.keys(COLOR_LABEL) as TypeColor[]).map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
              </OkSelect>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })}>
                {item.is_active ? 'Desativar' : 'Ativar'}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {prog.button}
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado.</p>
    </div>
  )
}
