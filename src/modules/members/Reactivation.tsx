import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifyChange } from '@/core/undo'
import { setMemberCycleStatus, useCycles } from '@/modules/cycles/service'

interface Req {
  id: string; member_id: string; cycle_id: string; message: string | null; status: 'pending' | 'approved' | 'rejected'
  created_at: string; decision_note: string | null
  members: { full_name: string; display_name: string | null } | null
}

function useRequests() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['reactivation', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('reactivation_requests')
        .select('id, member_id, cycle_id, message, status, created_at, decision_note, members(full_name, display_name)')
        .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return (data ?? []) as unknown as Req[]
    },
  })
}

/** Aviso fixo para quem está inativo: acesso limitado e pedido de volta (a Direção ou um professor autoriza). */
export function InactiveNotice() {
  const orgId = useOrgId()
  const { realMembership } = useOrganization()
  const qc = useQueryClient()
  const { data } = useRequests()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const mine = (data ?? []).find((r) => r.member_id === realMembership?.member_id)
  const send = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('request_reactivation', { p_org: orgId, p_message: message }); if (error) throw error },
    onSuccess: () => { toast.success('Pedido enviado. A Direção ou um professor vai analisar.'); setOpen(false); setMessage(''); qc.invalidateQueries({ queryKey: ['reactivation', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!realMembership?.inactive) return null
  return (
    <Card className="mb-4 space-y-2 border-warning bg-warning/10 p-4">
      <p className="font-semibold">Sua participação está inativa neste ciclo.</p>
      <p>Seu acesso está limitado ao seu perfil, à sua frequência e às suas mensalidades. Para voltar a participar, é preciso a autorização da Direção ou de um professor.</p>
      {mine?.status === 'pending' && <p><Badge className="bg-warning/30">Pedido em análise</Badge> enviado em {formatDate(mine.created_at.slice(0, 10))}.</p>}
      {mine?.status === 'rejected' && <p className="text-muted-foreground">Seu último pedido não foi aprovado{mine.decision_note ? `: ${mine.decision_note}` : '.'} Você pode pedir de novo.</p>}
      {mine?.status !== 'pending' && !open && <Button onClick={() => setOpen(true)}>Pedir para voltar</Button>}
      {open && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send.mutate() }}>
          <textarea rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" placeholder="Quer deixar um recado? (opcional)"
            value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={send.isPending}>Enviar pedido</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </Card>
  )
}

/** Pedidos de volta aguardando decisão (só aparecem para quem pode decidir: Direção e professores do grupo). */
export function ReactivationRequests() {
  const orgId = useOrgId()
  const { realMembership } = useOrganization()
  const qc = useQueryClient()
  const { data } = useRequests()
  const { data: cycles } = useCycles()
  const pending = (data ?? []).filter((r) => r.status === 'pending' && r.member_id !== realMembership?.member_id)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['reactivation', orgId] }); qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['member-cycles'] }) }

  const decide = useMutation({
    mutationFn: async (v: { req: Req; approve: boolean; force?: boolean }) => {
      const { error } = await supabase.rpc('decide_reactivation', { p_request: v.req.id, p_approve: v.approve, p_note: null, p_force: v.force ?? false })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      refresh()
      notifyChange(v.approve ? 'Pessoa reativada.' : 'Pedido recusado.', v.approve ? async () => {
        await setMemberCycleStatus({ member: v.req.member_id, cycle: v.req.cycle_id, status: 'inactive' })
        refresh()
      } : undefined)
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (/lotada/i.test(msg) && !v.force) toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => decide.mutate({ ...v, force: true }) } })
      else toast.error(msg)
    },
  })
  void cycles
  if (pending.length === 0) return null
  return (
    <Card className="space-y-2 border-primary/40 bg-primary/5 p-4">
      <h3>Pedidos para voltar ({pending.length})</h3>
      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card p-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.members?.display_name ?? r.members?.full_name}</p>
            <p className="text-muted-foreground">{r.message || 'Sem recado.'} · {formatDate(r.created_at.slice(0, 10))}</p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ req: r, approve: true })}>Aprovar</Button>
            <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ req: r, approve: false })}>Recusar</Button>
          </div>
        </div>
      ))}
    </Card>
  )
}
