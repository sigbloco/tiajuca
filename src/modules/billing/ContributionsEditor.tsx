import { PageLink } from '@/components/shared/PageLink'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Card, Skeleton } from '@/components/ui/primitives'
import { useCycles } from '@/modules/cycles/service'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { invalidateCatalog, mirrorFunctionToFees, type CatalogItem } from '@/modules/structure/service'

/** Grava o valor DO CICLO (não depende de datas): é o que a geração de cobranças usa. */
async function setCyclePrice(cycleId: string, category: string, amount: number) {
  const { error } = await supabase.rpc('set_cycle_fee_price', { p_category: category, p_cycle: cycleId, p_amount: amount })
  if (error) throw error
}

/** Uma linha de contribuinte: nome, a variável dos formulários e o valor mensal (grava ao sair do campo). */
function PayerRow({ item, current, canEdit, cycleId }: { item: CatalogItem; current: number | null; canEdit: boolean; cycleId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => setValue(current), [current])
  const dirty = value !== null && value !== current
  const save = useMutation({
    mutationFn: async () => { if (value !== null) await setCyclePrice(cycleId, item.id, value) },
    onSuccess: () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['fee-prices', orgId] }); notifySaved('Valor gravado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold">{item.name}</p>
        <p className="break-words font-mono text-xs text-muted-foreground" title="Variável para usar nos textos dos formulários">{'{valor:' + item.name + '}'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="w-28 sm:w-32"><MoneyInput value={value} onChange={setValue} onBlur={() => { if (canEdit && dirty && !save.isPending) save.mutate() }} /></div>
        <span className="text-sm text-muted-foreground">/mês</span>
      </div>
    </div>
  )
}

/** Valores: o valor mensal de cada contribuinte no ciclo escolhido, e quem é isento. */
export function ContributionsEditor({ canEdit, cycle }: { canEdit: boolean; cycle?: { id: string; name: string; starts_on: string; ends_on: string } }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const cats = useCatalog('fee_categories')
  const funcs = useCatalog('artistic_functions')
  const allCycles = useCycles()
  const prices = useQuery({
    queryKey: ['fee-prices', orgId, cycle?.id],
    enabled: Boolean(cycle),
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_cycle_prices').select('fee_category_id, amount').eq('cycle_id', cycle!.id)
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
  // Contribuintes pagam; todas as outras categorias (remuneradas e colaborativas) são isentas.
  const payers = functions.filter((f) => f.kind === 'payer').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const exempt = functions.filter((f) => f.kind !== 'payer')
  const dupNames = new Set(exempt.map((f) => f.name.toLowerCase()).filter((n, i, all) => all.indexOf(n) !== i))
  const exemptNames = exempt.map((f) => (dupNames.has(f.name.toLowerCase()) ? `${f.name} (${f.kind === 'paid' ? 'remunerado' : 'colaborativo'})` : f.name))
  const byName = new Map((cats.data ?? []).map((c) => [c.name.toLowerCase(), c]))
  // A categoria de valor se liga à categoria pelo id (o nome pode mudar).
  const byFn = new Map((cats.data ?? []).filter((c) => c.function_id).map((c) => [c.function_id as string, c]))

  // Contribuinte sem categoria de valor ainda: cria (só quem pode mexer em contribuições consegue).
  const linkedFns = new Set((cats.data ?? []).map((c) => c.function_id).filter(Boolean))
  const missingKey = payers.filter((f) => !linkedFns.has(f.id) && !byName.has(f.name.toLowerCase())).map((f) => `${f.id}~${f.name}`).join('|')
  useEffect(() => {
    if (!canEdit || !missingKey || !cats.data) return
    void Promise.all(missingKey.split('|').map((k) => { const i = k.indexOf('~'); return mirrorFunctionToFees(orgId, { fnId: k.slice(0, i), created: k.slice(i + 1) }) })).then(() => qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }))
  }, [missingKey, canEdit, cats.data]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Valor mensal de cada contribuinte no ciclo escolhido. Cobranças já geradas não mudam. A categoria de cada pessoa se define na ficha do integrante.
      </p>
      {!cycle && <p className="text-muted-foreground">Escolha um ciclo para ver e definir os valores.</p>}
      {canEdit && noOwnPrices && previous && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/30 bg-primary/5 p-3">
          <p className="min-w-0 flex-1 basis-56">Este ciclo ainda não tem valores. Copie os de <strong>{previous.name}</strong> e ajuste o que mudou.</p>
          <Button variant="outline" disabled={replicate.isPending} onClick={() => replicate.mutate()}><Copy className="h-4 w-4" /> Replicar</Button>
        </Card>
      )}
      {(cats.isLoading || funcs.isLoading) && <Skeleton className="h-24" />}

      <section className="space-y-2">
        <h3>Contribuintes</h3>
        <Card className="divide-y divide-border overflow-hidden p-0">
          {payers.map((f) => {
            const c = byFn.get(f.id) ?? byName.get(f.name.toLowerCase())
            return c
              ? cycle && <PayerRow key={f.id} item={c} current={prices.data?.[c.id] ?? null} canEdit={canEdit} cycleId={cycle.id} />
              : <p key={f.id} className="px-3 py-2.5 text-muted-foreground"><span className="font-semibold text-foreground">{f.name}</span> · criando a categoria</p>
          })}
        </Card>
      </section>

      <section className="space-y-1">
        <h3>Isento</h3>
        <p className="text-sm text-muted-foreground">
          Não pagam mensalidade: {exemptNames.length ? exemptNames.join(', ') : 'nenhuma categoria'}. Definido em <PageLink to="funcoes">Organização → Categorias</PageLink>.
        </p>
      </section>
    </div>
  )
}
