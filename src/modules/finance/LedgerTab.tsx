import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput, MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDate, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { monthRange, useFinCategories, type LedgerRow, type MonthSummary } from './service'

const SOURCE_LABEL = { lancamento: 'Lançamento', mensalidade: 'Mensalidade', equipe: 'Equipe' } as const

function EntrySheet({ kind, onClose }: { kind: 'income' | 'expense'; onClose: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const cats = useFinCategories()
  const [f, setF] = useState({ category: '', description: '', amount: null as number | null, date: todayIso(membership?.timezone), notes: '' })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('post_financial_entry', {
        p_org: orgId, p_category: f.category, p_description: f.description, p_amount: f.amount, p_occurred_on: f.date, p_notes: f.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Lançamento registrado.'); qc.invalidateQueries({ queryKey: ['finance', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const valid = f.category && f.description.trim() && f.amount && f.amount > 0 && f.date
  return (
    <SheetContent title={kind === 'income' ? 'Nova receita' : 'Nova despesa'} description="Mensalidades entram sozinhas como receita quando são baixadas.">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="fe-cat">Categoria</Label>
          <Select id="fe-cat" required value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Selecione…</option>
            {cats.data?.filter((c) => c.kind === kind && c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></div>
        <div className="space-y-1.5"><Label htmlFor="fe-desc">Descrição</Label><Input id="fe-desc" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="fe-amt">Valor</Label><MoneyInput id="fe-amt" required value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="fe-date">Data</Label><DateInput id="fe-date" required value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="fe-notes">Observação</Label><Input id="fe-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <Button type="submit" className="w-full" disabled={!valid || save.isPending}>Registrar</Button>
      </form>
    </SheetContent>
  )
}

/** Receitas ou despesas do mês (razão unificado). Lançamentos manuais podem ser cancelados com motivo; nada é apagado. */
export function LedgerTab({ kind, competence }: { kind: 'income' | 'expense'; competence: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('finance.manage')
  const [sheet, setSheet] = useState(false)
  const { from, to } = monthRange(competence)

  const summary = useQuery({
    queryKey: ['finance', orgId, 'summary', competence],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('finance_month_summary', { p_org: orgId, p_competence: competence })
      if (error) throw error
      return (data as MonthSummary[])[0]
    },
  })
  const ledger = useQuery({
    queryKey: ['finance', orgId, 'ledger', competence, kind],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_finance_ledger').select('ref, occurred_on, kind, amount, description, category, source')
        .eq('organization_id', orgId).eq('kind', kind).gte('occurred_on', from).lt('occurred_on', to).order('occurred_on', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []) as LedgerRow[]
    },
  })
  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_financial_entry', { p_entry: id, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Lançamento cancelado.'); qc.invalidateQueries({ queryKey: ['finance', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const s = summary.data
  const num = (v?: number) => formatCurrency(Number(v ?? 0))
  const total = (ledger.data ?? []).reduce((n, r) => n + Number(r.amount), 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kind === 'income' ? (
          <>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Mensalidades</p><p className="font-display text-xl font-bold">{num(s?.receita_mensalidades)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Outras receitas</p><p className="font-display text-xl font-bold">{num(s?.receita_outras)}</p></Card>
          </>
        ) : (
          <>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Despesas</p><p className="font-display text-xl font-bold">{num(s?.despesas)}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">Pagamentos da equipe</p><p className="font-display text-xl font-bold">{num(s?.pagamentos_equipe)}</p></Card>
          </>
        )}
        <Card className="p-3 lg:col-span-2"><p className="text-xs text-muted-foreground">Saldo do mês (receitas − despesas)</p>
          <p className={cn('font-display text-xl font-bold', Number(s?.saldo ?? 0) < 0 ? 'text-destructive' : 'text-success')}>{num(s?.saldo)}</p></Card>
      </div>

      <div className="flex items-center justify-between">
        <h2>{kind === 'income' ? 'Receitas' : 'Despesas'} <span className="text-base font-normal text-muted-foreground">· {formatCurrency(total)}</span></h2>
        {canManage && <Button onClick={() => setSheet(true)}><Plus className="h-4 w-4" /> {kind === 'income' ? 'Nova receita' : 'Nova despesa'}</Button>}
      </div>

      {ledger.isLoading && <Skeleton className="h-24" />}
      {ledger.data?.length === 0 && <EmptyState>Nada registrado neste mês.</EmptyState>}
      <div className="grid gap-2">
        {ledger.data?.map((r) => (
          <Card key={r.ref} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{r.description}</p>
              <p className="truncate text-muted-foreground">{formatDate(r.occurred_on)} · {r.category} · <Badge>{SOURCE_LABEL[r.source]}</Badge></p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('font-semibold', kind === 'income' ? 'text-success' : 'text-foreground')}>{formatCurrency(Number(r.amount))}</span>
              {canManage && r.source === 'lancamento' && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                  const reason = window.prompt('Motivo do cancelamento (obrigatório):')
                  if (reason?.trim()) cancel.mutate({ id: r.ref.replace('entry:', ''), reason })
                }}>Cancelar</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>{sheet && <EntrySheet kind={kind} onClose={() => setSheet(false)} />}</Sheet>
    </div>
  )
}
