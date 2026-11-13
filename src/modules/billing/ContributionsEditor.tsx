import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ReadMore } from '@/components/shared/ReadMore'
import { Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Card, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useUnsaved } from '@/core/unsaved'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { invalidateCatalog, mirrorFunctionToFees, type CatalogItem } from '@/modules/structure/service'

function useSetPrice(from: string) {
  return async (category: string, amount: number) => {
    const { error } = await supabase.rpc('set_fee_price', { p_category: category, p_amount: amount, p_from: from })
    if (error) throw error
  }
}

/** Categoria que reflete uma função: o nome não se edita; só o valor mensal (versionado: vale daqui para frente). */
function CategoryRow({ item, current, canEdit, from }: { item: CatalogItem; current: number | null; canEdit: boolean; from: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const setPrice = useSetPrice(from)
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => setValue(current), [current])
  const dirty = value !== null && value !== current
  useUnsaved(dirty, () => save.mutateAsync())
  const save = useMutation({
    mutationFn: async () => { if (value !== null) await setPrice(item.id, value) },
    onSuccess: () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['fee-prices', orgId] }); notifySaved('Valor atualizado. Cobranças já geradas não mudam.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Card className="flex flex-nowrap items-center gap-2 p-2 pl-3">
      <span className="min-w-0 flex-1"><span className="font-semibold">{item.name}</span><span className="text-muted-foreground">/mês</span></span>
      <div className="w-28 shrink-0 sm:w-32"><MoneyInput value={value} onChange={setValue} /></div>
      {canEdit && <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /></Button>}
    </Card>
  )
}

/**
 * Contribuições: as categorias refletem as funções. "Isento" vem primeiro e não se edita (Direção, Professor, Monitor e as funções marcadas como isentas).
 * Cada função não isenta tem uma categoria com o valor mensal; o nome vem da função.
 */
export function ContributionsEditor({ canEdit, cycle }: { canEdit: boolean; cycle?: { id: string; name: string; starts_on: string; ends_on: string } }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const cats = useCatalog('fee_categories')
  const funcs = useCatalog('artistic_functions')
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  // Valor do ciclo: o que vale na data de referência (hoje, se o ciclo está em andamento; senão o início ou o fim dele).
  const ref = cycle ? (today < cycle.starts_on ? cycle.starts_on : today > cycle.ends_on ? cycle.ends_on : today) : today
  const editable = canEdit && (!cycle || cycle.ends_on >= today)
  const from = cycle && today < cycle.starts_on ? cycle.starts_on : today
  const prices = useQuery({
    queryKey: ['fee-prices', orgId, ref],
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_category_prices').select('fee_category_id, amount').eq('organization_id', orgId).lte('valid_from', ref).or(`valid_to.is.null,valid_to.gte.${ref}`)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((p) => [p.fee_category_id as string, Number(p.amount)]))
    },
  })
  const functions = (funcs.data ?? []).filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const isExempt = (f: CatalogItem) => !!f.is_exempt || !!f.exempt_locked
  const exemptNames = functions.filter(isExempt).map((f) => f.name)
  const payers = functions.filter((f) => !isExempt(f)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const byName = new Map((cats.data ?? []).map((c) => [c.name.toLowerCase(), c]))

  // Função que paga e ainda não tem categoria: cria (só quem pode mexer em contribuições consegue).
  const missingKey = payers.filter((f) => !byName.has(f.name.toLowerCase())).map((f) => f.name).join('|')
  useEffect(() => {
    if (!canEdit || !missingKey || !cats.data) return
    void Promise.all(missingKey.split('|').map((n) => mirrorFunctionToFees(orgId, { created: n }))).then(() => qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }))
  }, [missingKey, canEdit, cats.data]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <h2>Valores{cycle ? ` · ${cycle.name}` : ''}</h2>
      <ReadMore>
        As categorias refletem as funções (Organização → Funções) e não se editam aqui; só o valor mensal. {cycle && cycle.ends_on < today ? 'Ciclo encerrado: só consulta.' : 'O valor muda daqui para frente (num ciclo futuro, vale desde o início dele); cobranças já geradas não mudam.'}
        Defina a categoria de cada pessoa na ficha do integrante.
      </ReadMore>
      {(cats.isLoading || funcs.isLoading) && <Skeleton className="h-24" />}
      <div className="grid gap-2">
        <Card className="space-y-1 border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Isento <span className="font-normal text-muted-foreground">· R$ 0,00 /mês</span></p>
          <p className="text-sm text-muted-foreground">Quem tem uma função isenta não paga: {exemptNames.length ? exemptNames.join(', ') : 'nenhuma ainda'}. Não é editável.</p>
        </Card>
        <ProgressiveList items={payers} render={(f) => {
          const c = byName.get(f.name.toLowerCase())
          return c ? <CategoryRow key={f.id} item={c} current={prices.data?.[c.id] ?? null} canEdit={editable} from={from} /> : (
            <Card key={f.id} className="p-2 pl-3 text-muted-foreground"><span className="font-semibold text-foreground">{f.name}</span> · criando a categoria</Card>
          )
        }} />
      </div>
    </div>
  )
}
