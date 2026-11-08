import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Label, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifyChange } from '@/core/undo'

const OPTIONS = [['direcao', 'Direção'], ['professor', 'Professor'], ['monitor', 'Monitor'], ['integrante', 'Integrante'], ['colaborador', 'Colaborador']] as const
const STAFF = ['direcao', 'professor', 'monitor', 'colaborador']
const RANK = ['titular', 'direcao', 'professor', 'monitor', 'colaborador'] // do mais alto ao mais baixo; sem nenhum = integrante

/** Função da pessoa no bloco (papel de acesso mais alto): Direção, Professor, Monitor, Integrante ou Colaborador. Só quem gerencia papéis troca. */
export function MemberRole({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('roles.manage')
  const roles = useQuery({
    queryKey: ['member-roles', orgId, memberId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_access_roles').select('access_roles!inner(key)').eq('member_id', memberId).is('revoked_at', null)
      if (error) throw error
      return ((data ?? []) as unknown as { access_roles: { key: string } }[]).map((r) => r.access_roles.key)
    },
  })
  const current = roles.data ? (RANK.find((k) => roles.data!.includes(k)) ?? 'integrante') : ''

  const call = async (fn: 'grant_access_role' | 'revoke_access_role', role: string) => {
    const { error } = await supabase.rpc(fn, { p_member: memberId, p_role_key: role })
    if (error) throw error
  }
  const change = useMutation({
    mutationFn: async (target: string) => {
      const had = roles.data ?? []
      if (target !== 'integrante') await call('grant_access_role', target) // primeiro concede: se falhar, nada muda
      for (const k of STAFF) if (k !== target && had.includes(k)) await call('revoke_access_role', k)
      return had
    },
    onSuccess: (before, target) => {
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ['member-roles', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['access-roles', orgId] }); qc.invalidateQueries({ queryKey: ['view-as-people', orgId] })
        if (memberId === membership?.member_id) qc.invalidateQueries({ queryKey: ['memberships'] })
      }
      refresh()
      notifyChange('Função atualizada.', async () => {
        for (const k of STAFF) if (before.includes(k)) await call('grant_access_role', k)
        if (target !== 'integrante' && !before.includes(target)) await call('revoke_access_role', target)
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  if (!canManage || !roles.data) return null
  if (current === 'titular') return <p className="text-sm"><span className="font-semibold">Função</span> <span className="text-muted-foreground">Titular do bloco</span></p>
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="member-role" className="text-sm">Função</Label>
      <Select id="member-role" className="w-auto" value={current} disabled={change.isPending} onChange={(e) => change.mutate(e.target.value)}>
        {OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </Select>
    </div>
  )
}
