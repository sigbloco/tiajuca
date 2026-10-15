import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { BASE_LABEL, useDestinations, type DistRow, type MonthSummary, type Rule } from './service'

type Base = NonNullable<Rule['base']>

function RuleSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const dests = useDestinations()
  const [f, setF] = useState({ destination_id: '', mode: 'percent' as 'percent' | 'fixed', percent: '', fixed: null as number | null, base: 'gross_income' as Base })
  const pct = Number(f.percent.replace(',', '.'))
  const valid = f.destination_id && (f.mode === 'percent' ? pct > 0 && pct <= 100 : f.fixed !== null && f.fixed >= 0)
  const save = useMutation({
    mutationFn: async () => {
      const row = f.mode === 'percent'
        ? { mode: 'percent', percent: pct, base: f.base, fixed_amount: null }
        : { mode: 'fixed', fixed_amount: f.fixed, percent: null, base: null }
      const { error } = await supabase.from('distribution_rules').insert({ organization_id: orgId, destination_id: f.destination_id, ...row })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Regra criada.'); qc.invalidateQueries({ queryKey: ['finance-rules', orgId] }); qc.invalidateQueries({ queryKey: ['finance', orgId] }); onClose() },
    onError: (e) => toast.error(/23514|soma dos percentuais/i.test(String((e as Error)?.message) + String((e as { code?: string })?.code)) ? 'A soma dos percentuais desta base não pode passar de 100%.' : friendlyError(e)),
  })
  return (
    <SheetContent title="Nova regra de distribuição" description="Valores fixos saem primeiro da receita. Percentuais seguem a base escolhida.">
      <div className="space-y-3">
        <Select aria-label="Destino" value={f.destination_id} onChange={(e) => setF({ ...f, destination_id: e.target.value })}>
          <option value="">Destino…</option>
          {dests.data?.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select aria-label="Tipo" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as 'percent' | 'fixed' })}>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo (R$)</option>
        </Select>
        {f.mode === 'percent' ? (
          <>
            <Input inputMode="decimal" placeholder="Percentual, ex.: 30" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value.replace(/[^\d.,]/g, '') })} />
            <Select aria-label="Base de cálculo" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value as Base })}>
              {(Object.keys(BASE_LABEL) as Base[]).map((b) => <option key={b} value={b}>Percentual {BASE_LABEL[b]}</option>)}
            </Select>
          </>
        ) : (
          <MoneyInput value={f.fixed} onChange={(v) => setF({ ...f, fixed: v })} />
        )}
        <Button className="w-full" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Salvar regra</Button>
      </div>
    </SheetContent>
  )
}

/** Distribuição do mês: destinos, regras (percentual/fixo + base) e simulação com saldo não distribuído. */
export function DistributionTab({ competence }: { competence: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('finance.manage')
  const dests = useDestinations()
  const [sheet, setSheet] = useState(false)
  const [newDest, setNewDest] = useState('')

  const rules = useQuery({
    queryKey: ['finance-rules', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('distribution_rules').select('*').eq('organization_id', orgId).eq('is_active', true).order('priority').order('created_at')
      if (error) throw error
      return (data ?? []) as Rule[]
    },
  })
  const dist = useQuery({
    queryKey: ['finance', orgId, 'dist', competence],
    queryFn: async () => {
      const [d, s] = await Promise.all([
        supabase.rpc('compute_distribution', { p_org: orgId, p_competence: competence }),
        supabase.rpc('finance_month_summary', { p_org: orgId, p_competence: competence }),
      ])
      if (d.error) throw d.error
      if (s.error) throw s.error
      return { rows: (d.data ?? []) as DistRow[], summary: (s.data as MonthSummary[])[0] }
    },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['finance-rules', orgId] }); qc.invalidateQueries({ queryKey: ['finance', orgId] }); qc.invalidateQueries({ queryKey: ['fin-destinations', orgId] }) }
  const endRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('distribution_rules').update({ is_active: false, valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Regra encerrada.'); refresh() }, onError: (e) => toast.error(friendlyError(e)),
  })
  const addDest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('distribution_destinations').insert({
        organization_id: orgId, name: newDest.trim(), kind: 'custom', sort_order: (dests.data?.reduce((m, d) => Math.max(m, d.sort_order), 0) ?? 0) + 1 })
      if (error) throw error
    },
    onSuccess: () => { setNewDest(''); toast.success('Destino criado.'); refresh() }, onError: (e) => toast.error(friendlyError(e)),
  })
  const toggleDest = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('distribution_destinations').update({ is_active: active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })

  const gross = Number(dist.data?.summary.receita_mensalidades ?? 0) + Number(dist.data?.summary.receita_outras ?? 0)
  const allocated = (dist.data?.rows ?? []).reduce((n, r) => n + Number(r.total), 0)
  const remainder = gross - allocated
  const sumByBase = (b: Base) => (rules.data ?? []).filter((r) => r.mode === 'percent' && r.base === b).reduce((n, r) => n + Number(r.percent), 0)
  const destName = (id: string) => dests.data?.find((d) => d.id === id)?.name ?? '—'

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Simulação do mês</h3>
          <span className="text-muted-foreground">Receita do mês: <strong>{formatCurrency(gross)}</strong></span>
        </div>
        {dist.isLoading && <Skeleton className="h-20" />}
        {dist.data?.rows.map((r) => (
          <div key={r.destination_id} className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <div><p className="font-semibold">{r.destination_name}</p>
              <p className="text-xs text-muted-foreground">fixo {formatCurrency(Number(r.fixed_total))} · percentual {formatCurrency(Number(r.percent_total))}</p></div>
            <span className="font-semibold">{formatCurrency(Number(r.total))}</span>
          </div>
        ))}
        <div className={cn('flex items-center justify-between border-t border-border pt-2 font-semibold', remainder < 0 && 'text-destructive')}>
          <span>{remainder < 0 ? 'Distribuição acima da receita' : 'Não distribuído (fica no caixa)'}</span>
          <span>{formatCurrency(remainder)}</span>
        </div>
        {remainder < 0 && <p className="text-xs text-destructive">As regras comprometem mais do que a receita do mês. Revise valores fixos e percentuais.</p>}
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3>Regras</h3>
          {canManage && <Button size="sm" onClick={() => setSheet(true)}><Plus className="h-4 w-4" /> Nova regra</Button>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(BASE_LABEL) as Base[]).map((b) => (
            <Badge key={b} className={sumByBase(b) > 100 ? 'bg-destructive/15 text-destructive' : ''}>{BASE_LABEL[b]}: {sumByBase(b).toLocaleString('pt-BR')}% de 100%</Badge>
          ))}
        </div>
        {rules.data?.length === 0 && <EmptyState>Nenhuma regra. Crie regras para simular a distribuição.</EmptyState>}
        {rules.data?.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{destName(r.destination_id)}</p>
              <p className="text-muted-foreground">
                {r.mode === 'fixed' ? `${formatCurrency(Number(r.fixed_amount))} fixos por mês` : `${Number(r.percent).toLocaleString('pt-BR')}% ${BASE_LABEL[r.base!]}`}
              </p>
            </div>
            {canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm('Encerrar esta regra? O histórico é mantido.')) endRule.mutate(r.id) }}>Encerrar</Button>}
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h3>Destinos</h3>
        {canManage && (
          <div className="flex gap-2">
            <Input placeholder="Novo destino (ex.: Aluguel mensal de espaço)" value={newDest} onChange={(e) => setNewDest(e.target.value)} />
            <Button disabled={!newDest.trim() || addDest.isPending} onClick={() => addDest.mutate()}>Adicionar</Button>
          </div>
        )}
        {dests.data?.map((d) => (
          <Card key={d.id} className={cn('flex items-center justify-between p-2 pl-3', !d.is_active && 'opacity-60')}>
            <span className="font-semibold">{d.name}</span>
            {canManage && <Button size="sm" variant="outline" onClick={() => toggleDest.mutate({ id: d.id, active: !d.is_active })}>{d.is_active ? 'Desativar' : 'Ativar'}</Button>}
          </Card>
        ))}
      </section>
      <Sheet open={sheet} onOpenChange={setSheet}>{sheet && <RuleSheet onClose={() => setSheet(false)} />}</Sheet>
    </div>
  )
}
