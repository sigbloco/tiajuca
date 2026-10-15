import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { toast } from 'sonner'
import { Card, Select, SheetContent, Skeleton } from '@/components/ui/primitives'
import { maskPhone } from '@/components/ui/masked-inputs'
import { socialLabel, socialUrl } from '@/core/social'
import { whatsappUrl } from '@/modules/suppliers/service'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { setMemberCycleStatus, useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { MemberBilling } from '@/modules/billing/MemberBilling'
import { ArtisticLinks } from './ArtisticLinks'
import type { MemberRow } from './service'

function CycleParticipation({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const canManage = usePermission('member_cycles.manage', 'group')
  const canForce = usePermission('capacity.manage')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['member-cycles', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('cycle_id, status_id').eq('member_id', memberId)
      if (error) throw error
      return data as { cycle_id: string; status_id: string }[]
    },
  })

  const change = useMutation({
    mutationFn: (v: { cycle: string; status: string; force?: boolean }) => setMemberCycleStatus({ member: memberId, ...v }),
    onSuccess: () => {
      toast.success('Status atualizado.')
      qc.invalidateQueries({ queryKey: ['member-cycles', orgId, memberId] })
      qc.invalidateQueries({ queryKey: ['capacity', orgId] })
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (canForce && /lotado/i.test(msg) && !v.force) {
        toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => change.mutate({ ...v, force: true }) } })
      } else toast.error(msg)
    },
  })

  return (
    <section className="space-y-2">
      <h3>Participação nos ciclos</h3>
      {isLoading && <Skeleton className="h-16" />}
      {cycles?.filter((c) => c.is_active).map((c) => {
        const current = statuses?.find((s) => s.id === rows?.find((r) => r.cycle_id === c.id)?.status_id)
        return (
          <Card key={c.id} className="flex items-center justify-between gap-2 p-3">
            <p className="font-semibold">{c.name}</p>
            <Select
              className="w-40"
              disabled={!canManage || change.isPending}
              value={current?.key ?? ''}
              onChange={(e) => change.mutate({ cycle: c.id, status: e.target.value })}
              aria-label={`Status em ${c.name}`}
            >
              {!current && <option value="">Sem registro</option>}
              {statuses?.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
            </Select>
          </Card>
        )
      })}
    </section>
  )
}

function ContactLinks({ member }: { member: MemberRow }) {
  const social = socialUrl(member.social_handle)
  const wa = whatsappUrl(member.phone)
  if (!member.phone && !social && !member.email) return null
  const cls = 'inline-flex items-center rounded-md border border-border px-2 py-1 text-sm hover:bg-muted'
  return (
    <div className="flex flex-wrap gap-2">
      {member.phone && <a className={cls} href={wa ?? `tel:${member.phone}`} target="_blank" rel="noreferrer noopener">WhatsApp {maskPhone(member.phone)}</a>}
      {social && <a className={cls} href={social} target="_blank" rel="noreferrer noopener">{socialLabel(social)}</a>}
      {member.email && <a className={cls} href={`mailto:${member.email}`}>{member.email}</a>}
    </div>
  )
}

export function MemberDetailSheet({ member }: { member: MemberRow }) {
  return (
    <SheetContent title={member.display_name ?? member.full_name} description={member.display_name ? member.full_name : (member.email ?? '')}>
      <ContactLinks member={member} />
      <CycleParticipation memberId={member.id} />
      <ArtisticLinks memberId={member.id} />
      <MemberBilling memberId={member.id} />
    </SheetContent>
  )
}
