import { usePurge } from '@/core/purge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { TrashGroup } from '@/components/shared/TrashGroup'
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
  /** Exige escolher o naipe (instrumentos). */
  withSection?: boolean
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
  /** Em vez de "Desativar": ícone de lixeira, e os itens apagados ficam numa lixeira própria (restaurar). */
  trashMode?: boolean
  /** Com trashMode: a lixeira fica em outro lugar da página (não mostra a própria). */
  externalTrash?: boolean
  /** Campo de descrição (opcional) em cada item: aparece onde o item é escolhido (ex.: formulários). */
  withDescription?: boolean
  /** Níveis: escolher em quais naipes cada item vale. */
  withNaipes?: boolean
  /** Redes sociais: modelo do endereço de cada item. */
  withUrl?: boolean
}

export function useCatalog(table: CatalogTable) {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['catalog', orgId, table], queryFn: () => listCatalog(table, orgId) })
}

/** Editor genérico de catálogo configurável: criar, renomear, reordenar, ativar/desativar (nunca excluir). */
export function CatalogEditor({ table, title, singular, withSection, withColor, hint, canEdit, alphabetical, noFilter, mirrorFees, trashMode, externalTrash, withDescription, withNaipes, withUrl }: Props) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: items, isLoading } = useCatalog(table)
  const sections = useCatalog('sections')
  const [name, setName] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [urlTpl, setUrlTpl] = useState('')
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const visible = (items ?? []).filter((i) => (trashMode ? i.is_active : matchesStatus(i.is_active, filter.status)) && matchesText(i.name, filter.search))
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
        ...(withUrl ? { url_template: urlTpl.trim() } : {}),
      }),
    onSuccess: (id) => {
      if (mirrorFees) void mirrorFunctionToFees(orgId, { fnId: id, created: name.trim() }).then(() => qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }))
      setName(''); setUrlTpl('')
      refresh()
      notifySaved(`${singular} criado.`, id ? async () => { await saveCatalogItem(table, orgId, { id, name: name.trim(), is_active: false }); refresh() } : undefined)
    },
    onError,
  })
  const save = useMutation({
    mutationFn: async (item: Partial<CatalogItem> & { name: string }) => ({ prev: previousOf(items, item), id: await saveCatalogItem(table, orgId, item) }),
    onSuccess: ({ prev }, item) => {
      if (mirrorFees && prev) {
        if (item.name !== prev.name) void mirrorFunctionToFees(orgId, { fnId: item.id, renamed: { from: prev.name, to: item.name } })
        if (item.is_active !== undefined && item.is_active !== prev.is_active) void mirrorFunctionToFees(orgId, { fnId: item.id, active: { name: item.name, value: item.is_active } })
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
  const purge = usePurge(table)
  const onDragMove = (from: string, to: string) => reorder.mutate({ from, to })
  const move = useMutation({
    mutationFn: ({ a, b, list }: { a: CatalogItem; b: CatalogItem; list: CatalogItem[] }) => swapOrder(table, orgId, a, b, list),
    onSuccess: () => refresh(),
    onError,
  })

  const nameOf = (list: CatalogItem[] | undefined, id?: string | null) => list?.find((x) => x.id === id)?.name
  const canAdd = name.trim() && (!withSection || sectionId) && (!withUrl || urlTpl.includes('{handle}'))

  return (
    <div className="space-y-3">
      {title && <h2>{title}</h2>}
      {hint && <p className="text-muted-foreground">{hint}</p>}
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <Input className="min-w-40 flex-1" placeholder={`Novo(a) ${singular.toLowerCase()}`} value={name} onChange={(e) => setName(e.target.value)} />
          {withUrl && <Input className="min-w-56 flex-1" placeholder="Endereço, ex.: https://www.instagram.com/{handle}" aria-label="Endereço do perfil" value={urlTpl} onChange={(e) => setUrlTpl(e.target.value)} />}
          {withSection && (
            <Select className="w-44" value={sectionId} aria-label="Naipe" onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Naipe</option>
              {sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          <Card key={item.id} {...(canEdit && !alphabetical ? drag.row(item.id, onDragMove) : {})} className={cn('flex flex-wrap items-center gap-2 p-2', !item.is_active && 'opacity-60', drag.cls(item.id))}>
            {!alphabetical && <div className="flex flex-col items-center">
              <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Subir" disabled={!canEdit || idx === 0}
                onClick={() => move.mutate({ a: item, b: visible[idx - 1], list: visible })}><ArrowUp className="h-4 w-4" /></Button>
              {canEdit && drag.handle(item.id, onDragMove)}
              <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Descer" disabled={!canEdit || idx === visible.length - 1}
                onClick={() => move.mutate({ a: item, b: visible[idx + 1], list: visible })}><ArrowDown className="h-4 w-4" /></Button>
            </div>}
            <SaveInput value={item.name} disabled={!canEdit} aria-label={`Nome de ${item.name}`}
              onSave={(v) => save.mutateAsync({ id: item.id, name: v })} />
            {withSection && <Badge className="hidden sm:inline-flex">{nameOf(sections.data, item.section_id)}</Badge>}
            {withColor && (
              <OkSelect className="h-9 w-40" aria-label="Cor" disabled={!canEdit} value={item.color ?? 'primary'}
                onSave={(v) => save.mutateAsync({ id: item.id, name: item.name, color: v })}>
                {(Object.keys(COLOR_LABEL) as TypeColor[]).map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
              </OkSelect>
            )}
            {canEdit && (trashMode
              ? <Button size="icon" variant="outline" className="text-destructive" aria-label={`Mover ${item.name} para a lixeira`} title="Mover para a lixeira" onClick={() => save.mutate({ id: item.id, name: item.name, is_active: false })}><Trash2 className="h-4 w-4" /></Button>
              : (
                <Button size="sm" variant="outline" onClick={() => save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })}>
                  {item.is_active ? 'Desativar' : 'Ativar'}
                </Button>
              ))}
            {withUrl && (
              <div className="basis-full">
                <SaveInput value={item.url_template ?? ''} disabled={!canEdit} aria-label={`Endereço de ${item.name}`} placeholder="https://www.exemplo.com/{handle}"
                  onSave={(v) => { if (!v.includes('{handle}')) { toast.error('O endereço precisa ter {handle} no lugar do usuário.'); return } return save.mutateAsync({ id: item.id, name: item.name, url_template: v.trim() }) }} />
              </div>
            )}
            {withNaipes && (
              <div className="flex basis-full flex-wrap items-center gap-1.5" role="group" aria-label={`Naipes em que ${item.name} vale`}>
                {(() => {
                  const cur = item.section_ids ?? []
                  const set = (next: string[]) => save.mutate({ id: item.id, name: item.name, section_ids: next })
                  const chip = (on: boolean) => cn('rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70', !canEdit && 'pointer-events-none')
                  return (
                    <>
                      <button type="button" aria-pressed={cur.length === 0} className={chip(cur.length === 0)} onClick={() => set([])}>Todos os naipes</button>
                      {(sections.data ?? []).filter((s) => s.is_active).map((s) => (
                        <button key={s.id} type="button" aria-pressed={cur.includes(s.id)} className={chip(cur.includes(s.id))} onClick={() => set(cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id])}>{s.name}</button>
                      ))}
                    </>
                  )
                })()}
              </div>
            )}
            {withDescription && (
              <div className="basis-full">
                <SaveInput value={item.description ?? ''} allowEmpty disabled={!canEdit} placeholder="Descrição" aria-label={`Descrição de ${item.name}`}
                  onSave={(v) => save.mutateAsync({ id: item.id, name: item.name, description: v.trim() || null })} />
              </div>
            )}
          </Card>
        ))}
      </div>
      {prog.button}
      <p className="text-xs text-muted-foreground">{trashMode ? 'Itens na lixeira somem das novas escolhas, mas o histórico é preservado.' : 'Itens desativados somem das novas escolhas, mas o histórico é preservado.'}</p>
      {trashMode && !externalTrash && canEdit && (
        <TrashGroup entries={(items ?? []).filter((i) => !i.is_active).map((i) => ({ id: i.id, name: i.name }))}
          onRestore={(id) => { const it = items?.find((x) => x.id === id); if (it) save.mutate({ id, name: it.name, is_active: true }) }}
          onPurge={['skill_levels', 'gender_options', 'race_options'].includes(table) ? (id) => purge.mutate(id) : undefined} />
      )}
    </div>
  )
}
