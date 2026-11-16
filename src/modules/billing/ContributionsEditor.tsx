import { PageLink } from '@/components/shared/PageLink'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Card, Skeleton } from '@/components/ui/primitives'
import { useCycles } from '@/modules/cycles/service'
import { friendlyError } from '@/core/errors'
import { todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { invalidateCatalog, mirrorFunctionToFees, type CatalogItem } from '@/modules/structure/service'

/** Grava o valor: com ciclo, é o valor DO CICLO (não depende de datas); sem ciclo, vale daqui para frente. */
function useSetPrice(cycleId: string | undefined, from: string) {
  return async (category: string, amount: number) => {
    const { error } = cycleId
      ? await supabase.rpc('set_cycle_fee_price', { p_category: category, p_cycle: cycleId, p_amount: amount })
      : await supabase.rpc('set_fee_price', { p_category: category, p_amount: amount, p_from: from })
    if (error) throw error
  }
}

/** Categoria que acompanha uma categoria de Organização: o nome não se edita; só o valor mensal (versionado: vale daqui para frente). */
function CategoryRow({ item, current, canEdit, from, cycleId }: { item: CatalogItem; current: number | null; canEdit: boolean; from: string; cycleId?: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const setPrice = useSetPrice(cycleId, from)
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => setValue(current), [current])
  const dirty = value !== null && value !== current
  const save = useMutation({
    mutationFn: async () => { if (value !== null) await setPrice(item.id, value) },
    onSuccess: () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['fee-prices', orgId] }); notifySaved('Valor gravado. Cobranças já geradas não mudam.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Card className="flex flex-nowrap items-center gap-2 p-2 pl-3">
      <span className="min-w-0 flex-1"><span className="font-semibold">{item.name}</span><span className="text-muted-foreground">/mês</span>
        <span className="block break-words font-mono text-xs text-muted-foreground" title="Variável para usar nos textos dos formulários">{'{valor:' + item.name + '}'}</span></span>
      <div className="w-28 shrink-0 sm:w-32"><MoneyInput value={value} onChange={setValue} onBlur={() => { if (canEdit && dirty && !save.isPending) save.mutate() }} /></div>
    </Card>
  )
}

/**
 * Contribuições: as categorias refletem as funções. "Isento" vem primeiro e não se edita (direção, Professor, Monitor e as funções marcadas como isentas).
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
  const editable = canEdit
  const allCycles = useCycles()
  const from = cycle && today < cycle.starts_on ? cycle.starts_on : today
  const prices = useQuery({
    queryKey: ['fee-prices', orgId, cycle?.id ?? ref],
    queryFn: async () => {
      if (cycle) {
        const { data, error } = await supabase.from('fee_cycle_prices').select('fee_category_id, amount').eq('cycle_id', cycle.id)
        if (error) throw error
        return Object.fromEntries((data ?? []).map((p) => [p.fee_category_id as string, Number(p.amount)]))
      }
      const { data, error } = await supabase.from('fee_category_prices').select('fee_category_id, amount').eq('organization_id', orgId).lte('valid_from', ref).or(`valid_to.is.null,valid_to.gte.${ref}`)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((p) => [p.fee_category_id as string, Number(p.amount)]))
    },
  })
  // Ciclo ainda sem valores próprios: oferece copiar os do ciclo anterior.
  const previous = cycle ? (allCycles.data ?? []).filter((c) => c.starts_on < cycle.starts_on).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] : undefined
  const noOwnPrices = !!cycle && prices.isSuccess && Object.keys(prices.data ?? {}).length === 0
  const replicate = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('replicate_cycle_prices', { p_cycle: cycle!.id }); if (error) throw error; return data as number },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['fee-prices', orgId] }); toast.success(`Valores copiados de ${previous?.name}: ${n} categoria(s).`) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const functions = (funcs.data ?? []).filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const isExempt = (f: CatalogItem) => !!f.is_exempt || !!f.exempt_locked
  // Mesmo nome em duas seções (ex.: Monitor remunerado e Monitor colaborativo): mostra a seção entre parênteses.
  const dupNames = new Set(functions.map((f) => f.name.toLowerCase()).filter((n, i, all) => all.indexOf(n) !== i))
  const exemptNames = functions.filter(isExempt).map((f) => (dupNames.has(f.name.toLowerCase()) ? `${f.name} (${f.kind === 'paid' ? 'remunerado' : f.kind === 'artistic' ? 'artístico' : 'colaborativo'})` : f.name))
  const payers = functions.filter((f) => !isExempt(f)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const byName = new Map((cats.data ?? []).map((c) => [c.name.toLowerCase(), c]))

  // Função que paga e ainda não tem categoria: cria (só quem pode mexer em contribuições consegue).
  const linkedFns = new Set((cats.data ?? []).map((c) => c.function_id).filter(Boolean))
  const missingKey = payers.filter((f) => !linkedFns.has(f.id) && !byName.has(f.name.toLowerCase())).map((f) => `${f.id}~${f.name}`).join('|')
  useEffect(() => {
    if (!canEdit || !missingKey || !cats.data) return
    void Promise.all(missingKey.split('|').map((k) => { const i = k.indexOf('~'); return mirrorFunctionToFees(orgId, { fnId: k.slice(0, i), created: k.slice(i + 1) }) })).then(() => qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }))
  }, [missingKey, canEdit, cats.data]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <h2>Valores{cycle ? ` · ${cycle.name}` : ''}</h2>
      <p className="text-sm text-muted-foreground">
        O valor mensal de cada categoria <strong>vale para o ciclo escolhido</strong> (e é o que os formulários desse ciclo mostram nas variáveis <code className="font-mono">{'{valor}'}</code>). Cada ciclo pode ter valores diferentes; os de ciclos antigos também podem ser corrigidos.
        As categorias acompanham as de <PageLink to="funcoes">Organização → Categorias</PageLink> e não se editam aqui; só o valor. Cobranças já geradas não mudam. Defina a categoria de cada pessoa na ficha do integrante.
      </p>
      {editable && noOwnPrices && previous && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/30 bg-primary/5 p-3">
          <p className="min-w-0 flex-1 basis-56">Este ciclo ainda não tem valores próprios. Copie os de <strong>{previous.name}</strong> e ajuste o que mudou.</p>
          <Button variant="outline" disabled={replicate.isPending} onClick={() => replicate.mutate()}><Copy className="h-4 w-4" /> Replicar de {previous.name}</Button>
        </Card>
      )}
      {(cats.isLoading || funcs.isLoading) && <Skeleton className="h-24" />}
      <div className="grid gap-2">
        <Card className="space-y-1 border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Isento <span className="font-normal text-muted-foreground">· R$ 0,00 /mês</span></p>
          <p className="text-sm text-muted-foreground">Quem tem uma categoria isenta não paga: {exemptNames.length ? exemptNames.join(', ') : 'nenhuma ainda'}. Não é editável.</p>
        </Card>
        <ProgressiveList items={payers} render={(f) => {
          const c = byName.get(f.name.toLowerCase())
          return c ? <CategoryRow key={f.id} item={c} current={prices.data?.[c.id] ?? null} canEdit={editable} from={from} cycleId={cycle?.id} /> : (
            <Card key={f.id} className="p-2 pl-3 text-muted-foreground"><span className="font-semibold text-foreground">{f.name}</span> · criando a categoria</Card>
          )
        }} />
      </div>
    </div>
  )
}
