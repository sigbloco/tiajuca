import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DateInput, MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Card, EmptyState, Input } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { CatalogEditor, useCatalog } from '@/modules/structure/CatalogEditor'

function PriceRow({ id, name, current }: { id: string; name: string; current: number | null }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [value, setValue] = useState<number | null>(current)
  useEffect(() => setValue(current), [current])
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_fee_price', { p_category: id, p_amount: value, p_from: todayIso(membership?.timezone) })
      if (error) throw error
    },
    onSuccess: () => { toast.success(`Valor de ${name} atualizado a partir de hoje. Cobranças já geradas não mudam.`); qc.invalidateQueries({ queryKey: ['fee-prices', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <span className="font-semibold">{name}</span>
      <div className="flex items-center gap-2">
        <div className="w-32"><MoneyInput value={value} onChange={setValue} /></div>
        <Button size="sm" disabled={value === null || value === current || save.isPending} onClick={() => save.mutate()}>Salvar</Button>
      </div>
    </Card>
  )
}

/** Categorias de contribuição + valor atual de cada uma (versionado: novo valor vale daqui para frente). */
export function ContributionsSettings({ canEdit }: { canEdit: boolean }) {
  const orgId = useOrgId()
  const cats = useCatalog('fee_categories')
  const prices = useQuery({
    queryKey: ['fee-prices', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fee_category_prices').select('fee_category_id, amount').eq('organization_id', orgId).is('valid_to', null)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((p) => [p.fee_category_id as string, Number(p.amount)]))
    },
  })
  return (
    <div className="space-y-4">
      <CatalogEditor table="fee_categories" title="Categorias de contribuição" singular="Categoria" canEdit={canEdit}
        hint="Quem paga mensalidade tem uma categoria (ex.: Aluno, Músico, Pernalta). Defina a categoria de cada pessoa na ficha do integrante." />
      <section className="space-y-2">
        <h3>Valores mensais</h3>
        {canEdit && cats.data?.filter((c) => c.is_active).map((c) => <PriceRow key={c.id} id={c.id} name={c.name} current={prices.data?.[c.id] ?? null} />)}
        {cats.data?.length === 0 && <EmptyState>Crie uma categoria primeiro.</EmptyState>}
      </section>
    </div>
  )
}

/** Feriados usados para empurrar o vencimento para o próximo dia útil. */
export function HolidaysSettings() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [day, setDay] = useState('')
  const [name, setName] = useState('')
  const { data } = useQuery({
    queryKey: ['holidays', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('day, name').eq('organization_id', orgId).gte('day', `${new Date().getFullYear()}-01-01`).order('day')
      if (error) throw error
      return (data ?? []) as { day: string; name: string }[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['holidays', orgId] })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('holidays').upsert({ organization_id: orgId, day, name: name.trim() }, { onConflict: 'organization_id,day' })
      if (error) throw error
    },
    onSuccess: () => { setDay(''); setName(''); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (d: string) => {
      const { error } = await supabase.from('holidays').delete().eq('organization_id', orgId).eq('day', d)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      <h2>Feriados</h2>
      <p className="text-muted-foreground">Se o dia 10 (vencimento) cair em fim de semana ou feriado, a cobrança vence no próximo dia útil. Sem juros.</p>
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="w-36"><DateInput value={day} onChange={setDay} aria-label="Data do feriado" /></div>
        <Input className="min-w-40 flex-1" placeholder="Nome do feriado" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!day || !name.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</Button>
      </Card>
      <div className="grid gap-1.5">
        {data?.map((h) => (
          <Card key={h.day} className="flex items-center justify-between p-2 pl-3">
            <span><span className="font-semibold">{formatDate(h.day)}</span> · {h.name}</span>
            <Button size="icon" variant="ghost" aria-label={`Remover ${h.name}`} onClick={() => del.mutate(h.day)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
