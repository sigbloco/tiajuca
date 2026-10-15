import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput, MoneyInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDate, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { PAY_STATUS_CLASS, PAY_STATUS_LABEL, useDestinations, type StaffPayment } from './service'

function NewPaymentSheet({ competence, onClose }: { competence: string; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const dests = useDestinations()
  const [f, setF] = useState({ member: '', destination: '', amount: null as number | null, due: '', notes: '' })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_staff_payment', {
        p_member: f.member, p_competence: competence, p_destination: f.destination || null, p_amount: f.amount, p_due_on: f.due || null, p_notes: f.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Pagamento criado.'); qc.invalidateQueries({ queryKey: ['staff-payments', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Novo pagamento da equipe" description="Professores, monitores, diretores e outros colaboradores.">
      <div className="space-y-3">
        <MemberPicker value={f.member} onChange={(v) => setF({ ...f, member: v })} />
        <Select aria-label="Função / destino" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}>
          <option value="">Função / destino (opcional)</option>
          {dests.data?.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="sp-amt">Valor</Label><MoneyInput id="sp-amt" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="sp-due">Data prevista</Label><DateInput id="sp-due" value={f.due} onChange={(v) => setF({ ...f, due: v })} /></div>
        </div>
        <Input placeholder="Observação" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Button className="w-full" disabled={!f.member || !f.amount || f.amount <= 0 || save.isPending} onClick={() => save.mutate()}>Criar pagamento</Button>
      </div>
    </SheetContent>
  )
}

function PaySheet({ payment, onClose }: { payment: StaffPayment; onClose: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [paidOn, setPaidOn] = useState(todayIso(membership?.timezone))
  const [method, setMethod] = useState('PIX')
  const pix = useQuery({
    queryKey: ['pix-key', orgId, payment.member_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_pix_keys').select('key_type, key_value').eq('member_id', payment.member_id).eq('is_default', true).is('archived_at', null).maybeSingle()
      if (error) throw error
      return data as { key_type: string; key_value: string } | null
    },
  })
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ['staff-payments', orgId] }); qc.invalidateQueries({ queryKey: ['finance', orgId] }); onClose() }
  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_staff_payment_paid', { p_payment: payment.id, p_paid_on: paidOn, p_method: method, p_pix: null })
      if (error) throw error
    }, onSuccess: () => done('Pagamento registrado.'), onError: (e) => toast.error(friendlyError(e)),
  })
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_staff_payment', { p_payment: payment.id, p_reason: null })
      if (error) throw error
    }, onSuccess: () => done('Pagamento cancelado.'), onError: (e) => toast.error(friendlyError(e)),
  })
  const name = payment.members?.display_name ?? payment.members?.full_name ?? ''
  const copyPix = async () => { if (pix.data) { try { await navigator.clipboard.writeText(pix.data.key_value); toast.success('Chave PIX copiada.') } catch { toast.error('Não foi possível copiar.') } } }
  return (
    <SheetContent title={name} description={`${formatCurrency(Number(payment.amount))} · ${payment.distribution_destinations?.name ?? 'Equipe'}`}>
      <Badge className={PAY_STATUS_CLASS[payment.status]}>{PAY_STATUS_LABEL[payment.status]}</Badge>
      {payment.status === 'paid' && (
        <p className="text-muted-foreground">Pago em {formatDate(payment.paid_on)} via {payment.payment_method}. Chave usada: <span className="font-mono text-foreground">{payment.pix_key_snapshot ?? '—'}</span></p>
      )}
      {payment.status === 'pending' && (
        <>
          <Card className="space-y-1 p-3">
            <p className="text-xs text-muted-foreground">Chave PIX cadastrada</p>
            {pix.data ? (
              <div className="flex items-center justify-between gap-2"><span className="break-all font-mono">{pix.data.key_value}</span><Button size="sm" variant="outline" onClick={copyPix}>Copiar</Button></div>
            ) : <p className="text-warning">Esta pessoa ainda não cadastrou chave PIX.</p>}
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="pp-date">Data do pagamento</Label><DateInput id="pp-date" required value={paidOn} onChange={setPaidOn} /></div>
            <div className="space-y-1.5"><Label htmlFor="pp-m">Forma</Label>
              <Select id="pp-m" value={method} onChange={(e) => setMethod(e.target.value)}>{['PIX', 'Dinheiro', 'Transferência', 'Outro'].map((m) => <option key={m}>{m}</option>)}</Select></div>
          </div>
          <Button disabled={!paidOn || pay.isPending} onClick={() => pay.mutate()}>Marcar como pago</Button>
          <Button variant="ghost" className="text-destructive" onClick={() => { if (window.confirm('Cancelar este pagamento?')) cancel.mutate() }}>Cancelar pagamento</Button>
        </>
      )}
    </SheetContent>
  )
}

/** Pagamentos da equipe no mês, com histórico por pessoa e chave PIX registrada no momento do pagamento. */
export function StaffTab({ competence }: { competence: string }) {
  const orgId = useOrgId()
  const canManage = usePermission('staff_payments.manage')
  const [newSheet, setNewSheet] = useState(false)
  const [selected, setSelected] = useState<StaffPayment | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['staff-payments', orgId, competence],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_payments')
        .select('id, member_id, competence, amount, status, due_on, paid_on, payment_method, pix_key_snapshot, notes, members(full_name, display_name), distribution_destinations(name)')
        .eq('organization_id', orgId).eq('competence', competence).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StaffPayment[]
    },
  })
  const open = (data ?? []).filter((p) => p.status !== 'cancelled')
  const pending = open.filter((p) => p.status === 'pending').reduce((n, p) => n + Number(p.amount), 0)
  const paid = open.filter((p) => p.status === 'paid').reduce((n, p) => n + Number(p.amount), 0)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2>Pagamentos da equipe</h2>
        {canManage && <Button onClick={() => setNewSheet(true)}><Plus className="h-4 w-4" /> Novo pagamento</Button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3"><p className="text-xs text-muted-foreground">Pago</p><p className="font-display text-xl font-bold text-success">{formatCurrency(paid)}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Pendente</p><p className="font-display text-xl font-bold text-warning">{formatCurrency(pending)}</p></Card>
      </div>
      {isLoading && <Skeleton className="h-20" />}
      {data?.length === 0 && <EmptyState>Nenhum pagamento da equipe neste mês.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(p)}>
              <p className="truncate font-semibold">{p.members?.display_name ?? p.members?.full_name}</p>
              <p className="truncate text-muted-foreground">{p.distribution_destinations?.name ?? 'Equipe'}{p.due_on ? ` · previsto ${formatDate(p.due_on)}` : ''}</p>
            </button>
            <div className="flex flex-col items-end gap-1">
              <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
              <Badge className={PAY_STATUS_CLASS[p.status]}>{PAY_STATUS_LABEL[p.status]}</Badge>
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={newSheet} onOpenChange={setNewSheet}>{newSheet && <NewPaymentSheet competence={competence} onClose={() => setNewSheet(false)} />}</Sheet>
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>{selected && <PaySheet key={selected.id} payment={selected} onClose={() => setSelected(null)} />}</Sheet>
    </div>
  )
}
