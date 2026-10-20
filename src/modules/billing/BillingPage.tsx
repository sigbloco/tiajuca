import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { ChevronLeft, ChevronRight, ClipboardCopy, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible, TONES } from '@/components/shared/Collapsible'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { DateInput, MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCompetence, formatCurrency, formatDate, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import {
  CHARGE_STATUS_CLASS, CHARGE_STATUS_LABEL, competenceOf, generateCharges, getSummary, listAllCharges, listMyCharges, overdueWhatsapp,
  type Charge, type ChargeStatus,
} from './service'

// Nome do grupo de cada categoria dentro do naipe.
const GROUP_LABEL: Record<string, string> = { Aluno: 'Alunos', Senior: 'Seniors', Banda: 'Banda', 'Músico': 'Músicos', Pernalta: 'Pernaltas', 'Isento (equipe)': 'Isentos', Monitor: 'Monitores' }
const groupOf = (cat?: string | null) => (cat ? GROUP_LABEL[cat] ?? cat : 'Sem categoria')

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-display text-xl font-bold', tone)}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function ChargeSheet({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [paidOn, setPaidOn] = useState(todayIso(membership?.timezone))
  const [method, setMethod] = useState('PIX')
  const [amount, setAmount] = useState<number | null>(charge.final_amount)
  const [reason, setReason] = useState('')
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['billing', orgId] }); onClose() }
  const rpc = (fn: string, args: Record<string, unknown>) => async () => {
    const { error } = await supabase.rpc(fn, args)
    if (error) throw error
  }
  const pay = useMutation({ mutationFn: rpc('mark_charge_paid', { p_charge: charge.id, p_paid_on: paidOn, p_method: method }), onSuccess: () => done('Pagamento registrado.'), onError: (e) => toast.error(friendlyError(e)) })
  const adjust = useMutation({ mutationFn: rpc('adjust_charge', { p_charge: charge.id, p_new_amount: amount, p_reason: reason }), onSuccess: () => done('Valor ajustado e registrado.'), onError: (e) => toast.error(friendlyError(e)) })
  const status = useMutation({
    mutationFn: (s: 'cancelled' | 'pending') => rpc('change_charge_status', { p_charge: charge.id, p_status: s, p_notes: null })(),
    onSuccess: (_d, s) => done(s === 'cancelled' ? 'Cobrança cancelada.' : 'Cobrança reaberta.'), onError: (e) => toast.error(friendlyError(e)),
  })
  const name = shortName(charge.members?.full_name, charge.members?.display_name) ?? ''
  const editable = charge.status === 'pending' || charge.status === 'exempt'

  return (
    <SheetContent title={name} description={`${formatCompetence(charge.competence)} · ${charge.fee_categories?.name ?? ''}`}>
      <Card className="space-y-1 p-3">
        <div className="flex justify-between"><span className="text-muted-foreground">Valor base</span><span>{formatCurrency(charge.base_amount)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Bolsa ({charge.scholarship_percent}%)</span><span>− {formatCurrency(charge.scholarship_discount)}</span></div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Valor devido</span><span>{formatCurrency(charge.final_amount)}</span></div>
        <div className="flex items-center justify-between pt-1">
          <Badge className={CHARGE_STATUS_CLASS[charge.status]}>{CHARGE_STATUS_LABEL[charge.status]}</Badge>
          <span className="text-muted-foreground">Vence {formatDate(charge.due_on)}</span>
        </div>
        {charge.manual_adjustment && <p className="text-xs text-warning">Valor ajustado manualmente.</p>}
        {charge.paid_on && <p className="text-muted-foreground">Pago em {formatDate(charge.paid_on)}{charge.payment_method ? ` via ${charge.payment_method}` : ''}.</p>}
      </Card>

      {charge.status === 'pending' && (
        <section className="space-y-2">
          <h3>Registrar pagamento</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="paid-on">Data</Label><DateInput id="paid-on" required value={paidOn} onChange={setPaidOn} /></div>
            <div className="space-y-1.5"><Label htmlFor="method">Forma</Label>
              <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {['PIX', 'Dinheiro', 'Transferência', 'Cartão', 'Outro'].map((m) => <option key={m}>{m}</option>)}
              </Select></div>
          </div>
          <Button className="w-full" disabled={!paidOn || pay.isPending} onClick={() => pay.mutate()}>Marcar como pago</Button>
        </section>
      )}

      {editable && (
        <section className="space-y-2">
          <h3>Ajustar valor</h3>
          <MoneyInput value={amount} onChange={setAmount} />
          <Input placeholder="Motivo do ajuste (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="outline" className="w-full" disabled={amount === null || !reason.trim() || amount === charge.final_amount || adjust.isPending} onClick={() => adjust.mutate()}>
            Salvar ajuste
          </Button>
          <p className="text-xs text-muted-foreground">Fica registrado: valor original, novo valor, motivo, responsável e horário.</p>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {editable && <Button variant="ghost" className="text-destructive" onClick={() => { if (window.confirm('Cancelar esta cobrança? Ela permanece no histórico.')) status.mutate('cancelled') }}>Cancelar cobrança</Button>}
        {(charge.status === 'paid' || charge.status === 'cancelled') && (
          <Button variant="outline" onClick={() => { if (window.confirm('Reabrir esta cobrança como pendente?')) status.mutate('pending') }}>Reabrir cobrança</Button>
        )}
      </div>
    </SheetContent>
  )
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function AdminBilling() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const today = todayIso(membership?.timezone)
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  const [status, setStatus] = useState<ChargeStatus | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounced(searchInput)
  const [naipe, setNaipe] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Charge | null>(null)
  const competence = competenceOf(ym.y, ym.m)
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')

  const summary = useQuery({ queryKey: ['billing', orgId, 'summary', competence], queryFn: () => getSummary(orgId, competence) })
  const list = useQuery({ queryKey: ['billing', orgId, 'all', competence], queryFn: () => listAllCharges(orgId, competence) })
  const links = useQuery({
    queryKey: ['billing', orgId, 'links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_artistic_links').select('member_id, instrument_id, started_at, ended_at').eq('organization_id', orgId).not('instrument_id', 'is', null).limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; instrument_id: string; started_at: string; ended_at: string | null }[]
    },
  })
  const gen = useMutation({
    mutationFn: () => generateCharges(orgId, competence),
    onSuccess: (r) => {
      toast.success(`${r.created} cobrança(s) criada(s)${r.already_existing ? `, ${r.already_existing} já existiam` : ''}.`)
      if (r.skipped_no_price) toast.warning(`${r.skipped_no_price} sem valor definido para a categoria.`)
      qc.invalidateQueries({ queryKey: ['billing', orgId] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const copy = useMutation({
    mutationFn: () => overdueWhatsapp(orgId, competence, today),
    onSuccess: async (text) => {
      if (!text) return toast.message('Nenhum inadimplente nesta competência.')
      try { await navigator.clipboard.writeText(text); toast.success('Lista copiada. Cole no WhatsApp.') } catch { toast.error('Não foi possível copiar. Permita o acesso à área de transferência.') }
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const shift = (d: number) => { const x = new Date(Date.UTC(ym.y, ym.m + d, 1)); setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() }) }
  const s = summary.data
  // Naipe do integrante NAQUELE mês: vínculo vigente na competência; sem ele, o mais recente.
  const grouped = useMemo(() => {
    const secName = new Map((sections.data ?? []).map((x) => [x.id, x.name]))
    const instSec = new Map((instruments.data ?? []).map((i) => [i.id, i.section_id ?? '']))
    const monthStart = competence, monthEnd = competence.slice(0, 8) + '31'
    const byMember = new Map<string, NonNullable<typeof links.data>>()
    for (const l of links.data ?? []) (byMember.get(l.member_id) ?? byMember.set(l.member_id, []).get(l.member_id)!).push(l)
    const naipeOf = (memberId: string) => {
      const ls = byMember.get(memberId) ?? []
      const pick = ls.find((l) => l.started_at <= monthEnd && (!l.ended_at || l.ended_at >= monthStart)) ?? [...ls].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
      return pick ? secName.get(instSec.get(pick.instrument_id) ?? '') ?? 'Sem naipe' : 'Sem naipe'
    }
    const term = search.trim().toLowerCase()
    const map = new Map<string, Map<string, Charge[]>>()
    for (const c of list.data ?? []) {
      if (status && c.status !== status) continue
      if (term && !((c.members?.full_name ?? '') + ' ' + (c.members?.display_name ?? '')).toLowerCase().includes(term)) continue
      const nv = naipeOf(c.member_id)
      if (naipe && nv !== naipe) continue
      const g = groupOf(c.fee_categories?.name)
      const inner = map.get(nv) ?? new Map<string, Charge[]>()
      ;(inner.get(g) ?? inner.set(g, []).get(g)!).push(c)
      map.set(nv, inner)
    }
    const order = [...(sections.data ?? []).map((x) => x.name), 'Sem naipe']
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [list.data, links.data, sections.data, instruments.data, competence, status, search, naipe])
  const total = grouped.reduce((n, [, g]) => n + [...g.values()].reduce((k, v) => k + v.length, 0), 0)
  const forceOpen = search.trim() !== '' || naipe !== '' || status !== ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Mensalidades</h1>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-40 text-center font-display text-lg font-bold">{formatCompetence(competence)}</span>
          <Button size="icon" variant="outline" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Stat label="Total previsto" value={formatCurrency(s?.previsto ?? 0)} />
        <Stat label="Total recebido" value={formatCurrency(s?.recebido ?? 0)} tone="text-success" />
        <Stat label="Total pendente" value={formatCurrency(s?.pendente ?? 0)} tone="text-warning" />
        <Stat label="Total isento" value={formatCurrency(s?.isento ?? 0)} hint="valor base das isenções" />
        <Stat label="Impacto das bolsas" value={formatCurrency(s?.impacto_bolsas ?? 0)} />
        <Stat label="Inadimplentes" value={String(s?.inadimplentes ?? 0)} tone={s?.inadimplentes ? 'text-destructive' : undefined} hint="pendentes após o vencimento" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={gen.isPending} onClick={() => { if (window.confirm(`Gerar cobranças de ${formatCompetence(competence)}? Quem já tem cobrança no mês não será duplicado.`)) gen.mutate() }}>
          {gen.isPending ? 'Gerando…' : 'Gerar cobranças'}
        </Button>
        <Button variant="outline" disabled={copy.isPending} onClick={() => copy.mutate()}><ClipboardCopy className="h-4 w-4" /> Copiar inadimplentes</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar pelo nome" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <Select className="w-44" aria-label="Naipe" value={naipe} onChange={(e) => setNaipe(e.target.value)}>
          <option value="">Todos os naipes</option>
          {(sections.data ?? []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
          <option value="Sem naipe">Sem naipe</option>
        </Select>
        <Select className="w-40" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as ChargeStatus | '')}>
          <option value="">Todos</option>
          {Object.entries(CHARGE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {list.isLoading && <Skeleton className="h-24" />}
      {list.data && total === 0 && <EmptyState>{list.data.length === 0 ? 'Nenhuma cobrança neste mês. Use “Gerar cobranças”.' : 'Nenhuma cobrança com esses filtros.'}</EmptyState>}
      {grouped.map(([nv, groups], idx) => {
        const count = [...groups.values()].reduce((n, v) => n + v.length, 0)
        const sum = [...groups.values()].flat().reduce((n, c) => n + c.final_amount, 0)
        const tone = TONES[idx % TONES.length]
        const kNv = 'n:' + nv
        return (
          <Collapsible key={nv} tone={tone} title={nv} count={count} right={<span className="text-sm text-muted-foreground">{formatCurrency(sum)}</span>}
            open={forceOpen || !!open[kNv]} onToggle={() => setOpen((o) => ({ ...o, [kNv]: !o[kNv] }))}>
            {[...groups.entries()].sort((x, y) => x[0].localeCompare(y[0], 'pt-BR')).map(([g, items]) => {
              const k = kNv + ':' + g
              const subtotal = items.reduce((n, c) => n + c.final_amount, 0)
              return (
                <Collapsible key={g} level={1} tone={tone} title={g} count={items.length} right={<span className="text-sm text-muted-foreground">{formatCurrency(subtotal)}</span>}
                  open={forceOpen || (open[k] ?? groups.size === 1)} onToggle={() => setOpen((o) => ({ ...o, [k]: !(forceOpen || (o[k] ?? groups.size === 1)) }))}>
                  <ProgressiveList items={items} resetKey={competence + search + status} render={(c: Charge) => (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(c)}>
                  <p className="truncate font-semibold">{shortName(c.members?.full_name, c.members?.display_name)}</p>
                  <p className="truncate text-muted-foreground">{c.fee_categories?.name}{c.scholarship_percent > 0 ? ' · bolsa ' + c.scholarship_percent + '%' : ''} · vence {formatDate(c.due_on)}</p>
                </button>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{formatCurrency(c.final_amount)}</span>
                  <Badge className={CHARGE_STATUS_CLASS[c.status]}>{CHARGE_STATUS_LABEL[c.status]}</Badge>
                </div>
              </Card>
            )} />
                </Collapsible>
              )
            })}
          </Collapsible>
        )
      })}
      <p className="text-muted-foreground">{total} cobrança(s)</p>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <ChargeSheet key={selected.id} charge={selected} onClose={() => setSelected(null)} />}
      </Sheet>
    </div>
  )
}

/** Visão pessoal: "Minhas mensalidades" (celular primeiro). */
function MyBilling() {
  const { membership } = useOrganization()
  const memberId = membership?.member_id ?? ''
  const { data, isLoading } = useQuery({ queryKey: ['billing', 'mine', memberId], enabled: Boolean(memberId), queryFn: () => listMyCharges(memberId) })
  const today = todayIso(membership?.timezone)
  return (
    <div className="space-y-4">
      <h1>Minhas mensalidades</h1>
      {isLoading && <Skeleton className="h-24" />}
      {data?.length === 0 && <EmptyState>Você não possui mensalidades. Se isso estiver errado, fale com a Direção.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((c) => {
          const overdue = c.status === 'pending' && c.due_on < today
          return (
            <Card key={c.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold">{formatCompetence(c.competence)}</p>
                <Badge className={overdue ? 'bg-destructive/15 text-destructive' : CHARGE_STATUS_CLASS[c.status]}>
                  {overdue ? 'Em atraso' : CHARGE_STATUS_LABEL[c.status]}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{c.fee_categories?.name}{c.scholarship_percent > 0 ? ` · bolsa ${c.scholarship_percent}%` : ''}</span>
                <span className="text-lg font-semibold">{formatCurrency(c.final_amount)}</span>
              </div>
              <p className="text-muted-foreground">{c.status === 'paid' ? `Pago em ${formatDate(c.paid_on)}` : `Vence em ${formatDate(c.due_on)}`}</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function BillingPage() {
  return usePermission('billing.manage') ? <AdminBilling /> : <MyBilling />
}
