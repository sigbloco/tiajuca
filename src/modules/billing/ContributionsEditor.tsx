import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { invalidateCatalog, saveCatalogItem, swapOrder, type CatalogItem } from '@/modules/structure/service'

function useSetPrice() {
  const { membership } = useOrganization()
  return async (category: string, amount: number) => {
    const { error } = await supabase.rpc('set_fee_price', { p_category: category, p_amount: amount, p_from: todayIso(membership?.timezone) })
    if (error) throw error
  }
}

/** Uma categoria por linha: nome e valor no mesmo box (o valor é versionado: vale daqui para frente). */
function CategoryRow({ item, siblings, current, canEdit }: { item: CatalogItem; siblings: CatalogItem[]; current: number | null; canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const setPrice = useSetPrice()
  const [name, setName] = useState(item.name)
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => setName(item.name), [item.name])
  useEffect(() => setValue(current), [current])
  const idx = siblings.findIndex((s) => s.id === item.id)
  const dirty = name.trim() !== item.name || (value !== null && value !== current)

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim() && name.trim() !== item.name) await saveCatalogItem('fee_categories', orgId, { id: item.id, name: name.trim() })
      if (value !== null && value !== current) await setPrice(item.id, value)
    },
    onSuccess: () => {
      const oldName = item.name, oldPrice = current, priceChanged = value !== null && value !== current
      invalidateCatalog(qc, orgId)
      notifyChange('Categoria atualizada. Cobranças já geradas não mudam.', async () => {
        await saveCatalogItem('fee_categories', orgId, { id: item.id, name: oldName })
        if (priceChanged && oldPrice !== null) await setPrice(item.id, oldPrice)
        invalidateCatalog(qc, orgId)
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: () => saveCatalogItem('fee_categories', orgId, { id: item.id, name: item.name, is_active: !item.is_active }),
    onSuccess: () => {
      const was = item.is_active
      invalidateCatalog(qc, orgId)
      notifyChange(was ? 'Categoria desativada.' : 'Categoria reativada.', async () => {
        await saveCatalogItem('fee_categories', orgId, { id: item.id, name: item.name, is_active: was }); invalidateCatalog(qc, orgId)
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const move = useMutation({
    mutationFn: (other: CatalogItem) => swapOrder('fee_categories', orgId, item, other),
    onSuccess: (_d, other) => {
      invalidateCatalog(qc, orgId)
      notifyChange('Ordem alterada.', async () => {
        await swapOrder('fee_categories', orgId, { ...item, sort_order: other.sort_order }, { ...other, sort_order: item.sort_order }); invalidateCatalog(qc, orgId)
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <Card className={cn('flex flex-wrap items-center gap-2 p-2', !item.is_active && 'opacity-60')}>
      <div className="flex flex-col">
        <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Subir" disabled={!canEdit || idx <= 0} onClick={() => move.mutate(siblings[idx - 1])}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-5 w-8" aria-label="Descer" disabled={!canEdit || idx === siblings.length - 1} onClick={() => move.mutate(siblings[idx + 1])}><ArrowDown className="h-4 w-4" /></Button>
      </div>
      <Input className="min-w-36 flex-1 font-semibold" aria-label="Nome da categoria" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
      <div className="w-32"><MoneyInput value={value} onChange={setValue} /></div>
      <span className="text-muted-foreground">/mês</span>
      {canEdit && (
        <>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          <Button size="sm" variant="outline" onClick={() => toggle.mutate()}>{item.is_active ? 'Desativar' : 'Ativar'}</Button>
        </>
      )}
    </Card>
  )
}

/** Categorias de contribuição com o valor mensal na mesma linha. */
export function ContributionsEditor({ canEdit }: { canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const setPrice = useSetPrice()
  const cats = useCatalog('fee_categories')
  const prices = useQuery({
    queryKey: ['fee-prices', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_category_prices').select('fee_category_id, amount').eq('organization_id', orgId).is('valid_to', null)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((p) => [p.fee_category_id as string, Number(p.amount)]))
    },
  })
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('fee_categories')
        .insert({ organization_id: orgId, name: name.trim(), sort_order: (cats.data?.reduce((m, i) => Math.max(m, i.sort_order), 0) ?? 0) + 1 })
        .select('id').single()
      if (error) throw error
      if (amount !== null) await setPrice(data.id as string, amount)
      return data.id as string
    },
    onSuccess: (id) => {
      const created = name.trim()
      setName(''); setAmount(null); invalidateCatalog(qc, orgId)
      notifyChange('Categoria criada.', async () => { await saveCatalogItem('fee_categories', orgId, { id, name: created, is_active: false }); invalidateCatalog(qc, orgId) })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const items = (cats.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  return (
    <div className="space-y-3">
      <h2>Categorias de contribuição</h2>
      <p className="text-muted-foreground">
        Quem paga mensalidade tem uma categoria (ex.: Aluno, Senior, Banda, Pernalta). O valor muda daqui para frente; cobranças já geradas não mudam.
        Defina a categoria de cada pessoa na ficha do integrante.
      </p>
      {canEdit && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <Input className="min-w-36 flex-1" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="w-32"><MoneyInput value={amount} onChange={setAmount} /></div>
          <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      {cats.isLoading && <Skeleton className="h-24" />}
      {cats.data && items.length === 0 && <EmptyState>Nenhuma categoria ainda.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={items} render={(c) => <CategoryRow key={c.id} item={c} siblings={items} current={prices.data?.[c.id] ?? null} canEdit={canEdit} />} />
      </div>
    </div>
  )
}
