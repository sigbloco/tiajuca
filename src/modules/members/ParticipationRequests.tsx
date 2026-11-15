import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface Req { id: string; kind: 'artistic' | 'collab'; action: 'add' | 'remove'; created_at: string; who: string; instrument_id: string | null; function_id: string | null }

/** Integrantes: pedidos de mudança de participação feitos pelas próprias pessoas, esperando a Direção. Aprovar aplica a mudança. */
export function ParticipationRequests() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const can = usePermission('members.manage')
  const [open, setOpen] = useState(false)
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const list = useQuery({
    queryKey: ['participation-requests', orgId],
    enabled: can,
    queryFn: async () => {
      const { data, error } = await supabase.from('participation_requests')
        .select('id, kind, action, created_at, member_id, instrument_id, function_id, link_id')
        .eq('organization_id', orgId).eq('status', 'pending').order('created_at').limit(200)
      if (error) throw error
      const rows = (data ?? []) as unknown as { id: string; kind: 'artistic' | 'collab'; action: 'add' | 'remove'; created_at: string; member_id: string; instrument_id: string | null; function_id: string | null; link_id: string | null }[]
      const ids = [...new Set(rows.map((r) => r.member_id))]
      const names = new Map<string, string>()
      if (ids.length) {
        const m = await supabase.from('members').select('id, full_name, display_name').in('id', ids)
        if (m.error) throw m.error
        for (const x of m.data ?? []) names.set(x.id as string, (x.display_name as string | null) || (x.full_name as string))
      }
      const linkIds = rows.map((r) => r.link_id).filter(Boolean) as string[]
      const links = new Map<string, { instrument_id: string | null; function_id: string | null }>()
      if (linkIds.length) {
        const l = await supabase.from('member_artistic_links').select('id, instrument_id, function_id').in('id', linkIds)
        if (l.error) throw l.error
        for (const x of l.data ?? []) links.set(x.id as string, { instrument_id: x.instrument_id as string | null, function_id: x.function_id as string | null })
      }
      return rows.map((r) => { const lk = r.link_id ? links.get(r.link_id) : undefined; return { id: r.id, kind: r.kind, action: r.action, created_at: r.created_at, who: names.get(r.member_id) ?? '—', instrument_id: r.instrument_id ?? lk?.instrument_id ?? null, function_id: r.function_id ?? lk?.function_id ?? null } }) as Req[]
    },
  })
  const review = useMutation({
    mutationFn: async (v: { id: string; ok: boolean }) => { const { error } = await supabase.rpc('review_participation_request', { p_id: v.id, p_approve: v.ok }); if (error) throw error },
    onSuccess: (_d, v) => {
      toast.success(v.ok ? 'Aprovado: a mudança já foi aplicada.' : 'Pedido recusado.')
      qc.invalidateQueries({ queryKey: ['participation-requests', orgId] }); qc.invalidateQueries({ queryKey: ['members', orgId] }); qc.invalidateQueries({ queryKey: ['member-links', orgId] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const rows = list.data ?? []
  if (!can || rows.length === 0) return null
  return (
    <Collapsible open={open} onToggle={() => setOpen((v) => !v)} title="Pedidos de mudança de participação" count={rows.length} tone="warning">
      <ProgressiveList items={rows} render={(r) => {
        const what = (r.instrument_id ? instruments.data?.find((i) => i.id === r.instrument_id)?.name : functions.data?.find((f) => f.id === r.function_id)?.name) ?? '—'
        return (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-words font-semibold">{r.who}</p>
              <p className="text-sm text-muted-foreground">{r.action === 'add' ? 'Quer entrar em' : 'Quer sair de'} {what} ({r.kind === 'artistic' ? 'artística' : 'colaborativa'}) · {formatDate(r.created_at.slice(0, 10))}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, ok: true })}><Check className="h-4 w-4" /> Aprovar</Button>
              <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, ok: false })}><X className="h-4 w-4" /> Recusar</Button>
            </div>
          </Card>
        )
      }} />
    </Collapsible>
  )
}
