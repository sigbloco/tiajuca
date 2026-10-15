import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { listCatalog, saveCatalogItem, swapOrder, type CatalogItem, type CatalogTable } from './service'

interface Props {
  table: CatalogTable
  title: string
  singular: string
  /** Exige escolher a área (naipes, instrumentos). */
  withArea?: boolean
  /** Permite escolher o naipe do instrumento. */
  withSection?: boolean
  canEdit: boolean
}

export function useCatalog(table: CatalogTable) {
  const orgId = useOrgId()
  return useQuery({ queryKey: ['catalog', orgId, table], queryFn: () => listCatalog(table, orgId) })
}

/** Editor genérico de catálogo configurável: criar, renomear, reordenar, ativar/desativar (nunca excluir). */
export function CatalogEditor({ table, title, singular, withArea, withSection, canEdit }: Props) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: items, isLoading } = useCatalog(table)
  const areas = useCatalog('areas')
  const sections = useCatalog('sections')
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState('')
  const [sectionId, setSectionId] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['catalog', orgId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const add = useMutation({
    mutationFn: () =>
      saveCatalogItem(table, orgId, {
        name: name.trim(),
        sort_order: (items?.reduce((m, i) => Math.max(m, i.sort_order), 0) ?? 0) + 1,
        ...(withArea ? { area_id: areaId } : {}),
        ...(withSection && sectionId ? { section_id: sectionId } : {}),
      }),
    onSuccess: () => {
      setName('')
      toast.success(`${singular} criado.`)
      refresh()
    },
    onError,
  })
  const save = useMutation({
    mutationFn: (item: Partial<CatalogItem> & { name: string }) => saveCatalogItem(table, orgId, item),
    onSuccess: refresh,
    onError,
  })
  const move = useMutation({
    mutationFn: ({ a, b }: { a: CatalogItem; b: CatalogItem }) => swapOrder(table, orgId, a, b),
    onSuccess: refresh,
    onError,
  })

  const areaName = (id?: string | null) => areas.data?.find((a) => a.id === id)?.name
  const canAdd = name.trim() && (!withArea || areaId)

  return (
    <div className="space-y-3">
      <h2>{title}</h2>
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <Input className="min-w-40 flex-1" placeholder={`Novo(a) ${singular.toLowerCase()}`} value={name} onChange={(e) => setName(e.target.value)} />
          {withArea && (
            <Select className="w-44" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Área…</option>
              {areas.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
          {withSection && (
            <Select className="w-44" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Naipe (opcional)</option>
              {sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Button disabled={!canAdd || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}

      {isLoading && <Skeleton className="h-24" />}
      {items?.length === 0 && <EmptyState>Nada cadastrado ainda.</EmptyState>}
      <div className="grid gap-2">
        {items?.map((item, idx) => (
          <Card key={item.id} className={cn('flex items-center gap-2 p-2', !item.is_active && 'opacity-60')}>
            <div className="flex flex-col">
              <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Subir" disabled={!canEdit || idx === 0}
                onClick={() => move.mutate({ a: item, b: items[idx - 1] })}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Descer" disabled={!canEdit || idx === items.length - 1}
                onClick={() => move.mutate({ a: item, b: items[idx + 1] })}><ArrowDown className="h-4 w-4" /></Button>
            </div>
            <Input
              className="flex-1 border-transparent bg-transparent font-semibold"
              defaultValue={item.name}
              disabled={!canEdit}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== item.name) save.mutate({ id: item.id, name: v })
                else e.target.value = item.name
              }}
            />
            {(withArea || withSection) && <Badge className="hidden sm:inline-flex">{areaName(item.area_id) ?? ''}</Badge>}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => save.mutate({ id: item.id, name: item.name, is_active: !item.is_active })}>
                {item.is_active ? 'Desativar' : 'Ativar'}
              </Button>
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Itens desativados somem das novas escolhas, mas o histórico é preservado.</p>
    </div>
  )
}
