import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { Crown, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Badge, Button, Card, EmptyState, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifyChange } from '@/core/undo'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useMemberStatus } from '@/modules/members/useMemberStatus'

// "Integrante" não aparece: todo mundo é integrante. Aqui só se vê (e se concede) o que vai além disso.
const GRANTABLE = [{ key: 'direcao', label: 'Direção' }, { key: 'professor', label: 'Professor' }, { key: 'monitor', label: 'Monitor' }] as const
const GROUPS = [
  { key: 'direcao', label: 'Direção' }, { key: 'professor', label: 'Professores' }, { key: 'monitor', label: 'Monitores' },
] as const
const RANK: Record<string, number> = { titular: 50, direcao: 40, professor: 30, monitor: 20 }

interface Person { id: string; name: string; user_id: string | null; roles: Set<string> }

/** Quem tem papel de equipe, agrupado por papel. Integrantes comuns ficam de fora; para dar um papel a alguém, busque a pessoa. */
export function PeopleTab({ canTouchDirection, hasTitular, isTitular, onTransfer }: {
  canTouchDirection: boolean; hasTitular: boolean; isTitular: boolean; onTransfer: () => void
}) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const { isInactive } = useMemberStatus()
  const [extra, setExtra] = useState<string[]>([]) // pessoas buscadas para receber um papel
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const staff = useQuery({
    queryKey: ['access-roles', orgId, 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_access_roles')
        .select('member_id, access_roles!inner(key), members!inner(full_name, display_name, user_id, archived_at)')
        .eq('organization_id', orgId).is('revoked_at', null).in('access_roles.key', Object.keys(RANK)).is('members.archived_at', null)
      if (error) throw error
      return (data ?? []) as unknown as { member_id: string; access_roles: { key: string }; members: { full_name: string; display_name: string | null; user_id: string | null } }[]
    },
  })
  const everyone = useQuery({
    queryKey: ['members', orgId, 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; display_name: string | null; email: string | null }[]
    },
  })
  const userIdOf = useQuery({
    queryKey: ['access-members-users', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, user_id').eq('organization_id', orgId).is('archived_at', null).limit(2000)
      if (error) throw error
      return new Map((data ?? []).map((m) => [m.id as string, m.user_id as string | null]))
    },
  })

  const people = useMemo(() => {
    const map = new Map<string, Person>()
    for (const r of staff.data ?? []) {
      const p = map.get(r.member_id) ?? { id: r.member_id, name: shortName(r.members?.full_name, r.members?.display_name), user_id: r.members.user_id, roles: new Set<string>() }
      p.roles.add(r.access_roles.key)
      map.set(r.member_id, p)
    }
    for (const id of extra) {
      if (map.has(id)) continue
      const m = everyone.data?.find((x) => x.id === id)
      map.set(id, { id, name: m ? (shortName(m?.full_name, m?.display_name)) : '…', user_id: userIdOf.data?.get(id) ?? null, roles: new Set() })
    }
    return [...map.values()]
  }, [staff.data, extra, everyone.data, userIdOf.data])
  const top = (p: Person) => Object.keys(RANK).filter((k) => p.roles.has(k)).sort((a, b) => RANK[b] - RANK[a])[0] ?? 'novo'

  const refresh = () => { qc.invalidateQueries({ queryKey: ['access-roles', orgId] }); qc.invalidateQueries({ queryKey: ['view-as-people', orgId] }) }
  const toggle = useMutation({
    mutationFn: async ({ member, role, on }: { member: string; role: string; on: boolean }) => {
      const { error } = await supabase.rpc(on ? 'grant_access_role' : 'revoke_access_role', { p_member: member, p_role_key: role })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      refresh()
      if (v.member === membership?.member_id) qc.invalidateQueries({ queryKey: ['memberships'] })
      notifyChange(v.on ? 'Papel concedido.' : 'Papel removido.', async () => {
        const { error } = await supabase.rpc(v.on ? 'revoke_access_role' : 'grant_access_role', { p_member: v.member, p_role_key: v.role })
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const card = (p: Person) => {
    const inactive = isInactive(p.id)
    // O titular é a conta-mãe do bloco: só a coroa. Sem grupo, sem etiquetas e sem papéis para marcar.
    if (p.roles.has('titular')) {
      return (
        <Card key={p.id} className="p-3">
          <p className="flex items-center gap-1.5 font-semibold"><Crown className="h-4 w-4 shrink-0 text-primary" aria-label="Titular do bloco" />{p.name}</p>
        </Card>
      )
    }
    return (
      <Card key={p.id} className={cn('space-y-2 p-3', inactive && 'bg-muted/60 opacity-80')}>
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
            {p.name}
          </p>
          <div className="flex shrink-0 gap-1">
            {inactive && <Badge>Inativo</Badge>}
            {!(p.user_id ?? userIdOf.data?.get(p.id)) && <Badge>Sem conta de acesso</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GRANTABLE.map((r) => {
            const on = p.roles.has(r.key)
            const blocked = r.key === 'direcao' && !canTouchDirection
            return (
              <Button key={r.key} size="sm" variant={on ? 'default' : 'outline'} disabled={toggle.isPending || blocked} aria-pressed={on}
                title={blocked ? 'Somente o titular do bloco concede ou remove a Direção' : undefined}
                onClick={() => {
                  if (on && r.key === 'direcao' && !window.confirm('Remover o papel de Direção desta pessoa?')) return
                  toggle.mutate({ member: p.id, role: r.key, on: !on })
                }}>
                {blocked && <Lock className="h-3 w-3" />}{r.label}
              </Button>
            )
          })}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {hasTitular && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /> O bloco tem um <strong>titular</strong>: só ele concede ou remove a Direção.</p>
          {isTitular && <Button size="sm" variant="outline" onClick={onTransfer}>Transferir titularidade</Button>}
        </Card>
      )}
      <p className="text-muted-foreground">
        Todo cadastro já é <strong>integrante</strong>; aqui aparece só quem tem um papel além disso. Papéis acumulam (ex.: Professor e Direção). Toda mudança fica na auditoria.
      </p>

      <Card className="space-y-2 p-3">
        <p className="font-semibold">Dar um papel a alguém</p>
        <MemberPicker value="" onChange={(id) => { if (id) setExtra((x) => (x.includes(id) ? x : [...x, id])) }} />
        {people.filter((p) => top(p) === 'novo').map(card)}
      </Card>

      {people.filter((p) => p.roles.has('titular')).map(card)}
      {staff.isLoading && <Skeleton className="h-24" />}
      {staff.data && people.every((p) => top(p) === 'novo' || p.roles.has('titular')) && <EmptyState>Ninguém com papel de equipe ainda.</EmptyState>}
      {GROUPS.map((g) => {
        const list = people.filter((p) => top(p) === g.key).sort((a, b) => Number(isInactive(a.id)) - Number(isInactive(b.id)) || a.name.localeCompare(b.name, 'pt-BR'))
        if (list.length === 0) return null
        return (
          <Collapsible key={g.key} title={g.label} count={list.length} open={open[g.key] ?? false} onToggle={() => setOpen((o) => ({ ...o, [g.key]: !(o[g.key] ?? false) }))}>
            <ProgressiveList items={list} render={card} resetKey={g.key} />
          </Collapsible>
        )
      })}
    </div>
  )
}
