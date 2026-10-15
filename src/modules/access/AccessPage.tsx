import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { listMembers } from '@/modules/members/service'

const ROLES = [
  { key: 'direcao', label: 'Direção' }, { key: 'professor', label: 'Professor' },
  { key: 'monitor', label: 'Monitor' }, { key: 'integrante', label: 'Integrante' },
] as const
const SCOPE_LABEL: Record<string, string> = { org: 'toda a organização', group: 'seu grupo', own: 'apenas o próprio' }
const MODULE_LABEL: Record<string, string> = {
  organizacao: 'Organização', configuracoes: 'Configurações', acesso: 'Acesso', membros: 'Membros', auditoria: 'Auditoria', estrutura: 'Estrutura',
  ciclos: 'Ciclos', vagas: 'Vagas', eventos: 'Eventos', presenca: 'Presença', mensalidades: 'Mensalidades', financeiro: 'Financeiro',
  repertorio: 'Repertório', inscricoes: 'Inscrições',
}

function PeopleTab() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => { const t = setTimeout(() => { setSearch(input); setPage(0) }, 300); return () => clearTimeout(t) }, [input])

  const members = useQuery({
    queryKey: ['access-members', orgId, search, page],
    placeholderData: keepPreviousData,
    queryFn: () => listMembers({ orgId, search, page, pageSize: 15, sort: 'full_name', ascending: true, includeArchived: false }),
  })
  const ids = members.data?.rows.map((m) => m.id) ?? []
  const roles = useQuery({
    queryKey: ['access-roles', orgId, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_access_roles').select('member_id, access_roles(key)').in('member_id', ids).is('revoked_at', null)
      if (error) throw error
      const map: Record<string, Set<string>> = {}
      for (const r of (data ?? []) as unknown as { member_id: string; access_roles: { key: string } | null }[]) (map[r.member_id] ??= new Set()).add(r.access_roles?.key ?? '')
      return map
    },
  })
  const toggle = useMutation({
    mutationFn: async ({ member, role, on }: { member: string; role: string; on: boolean }) => {
      const { error } = await supabase.rpc(on ? 'grant_access_role' : 'revoke_access_role', { p_member: member, p_role_key: role })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      toast.success(v.on ? 'Papel concedido.' : 'Papel removido.')
      qc.invalidateQueries({ queryKey: ['access-roles', orgId] })
      if (v.member === membership?.member_id) qc.invalidateQueries({ queryKey: ['memberships'] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const total = members.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 15))

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Papéis são acumuláveis (ex.: uma pessoa pode ser Professor e Direção). Quem não tem nenhum papel não enxerga nada. Toda mudança fica na auditoria.</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar pessoa" value={input} onChange={(e) => setInput(e.target.value)} />
      </div>
      {members.isLoading && <Skeleton className="h-24" />}
      {members.data?.rows.length === 0 && <EmptyState>Ninguém encontrado.</EmptyState>}
      <div className="grid gap-2">
        {members.data?.rows.map((m) => {
          const mine = roles.data?.[m.id] ?? new Set<string>()
          return (
            <Card key={m.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold">{m.display_name ?? m.full_name}</p>
                {!m.user_id && <Badge>Sem conta de acesso</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => {
                  const on = mine.has(r.key)
                  return (
                    <Button key={r.key} size="sm" variant={on ? 'default' : 'outline'} disabled={toggle.isPending} aria-pressed={on}
                      onClick={() => {
                        if (on && r.key === 'direcao' && !window.confirm('Remover o papel de Direção desta pessoa?')) return
                        toggle.mutate({ member: m.id, role: r.key, on: !on })
                      }}>
                      {r.label}
                    </Button>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{total} pessoa(s)</p>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page + 1} / {pages}</span>
          <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}

interface Matrix { role: string; name: string; rank: number; perms: { key: string; scope: string; description: string; module: string }[] }

/** Leitura da matriz papel × permissão (a edição fina de permissões fica para uma etapa futura). */
function PermissionsTab() {
  const orgId = useOrgId()
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['access-matrix', orgId],
    queryFn: async () => {
      const [roles, rp, perms] = await Promise.all([
        supabase.from('access_roles').select('id, key, name, rank').eq('organization_id', orgId).order('rank', { ascending: false }),
        supabase.from('role_permissions').select('access_role_id, permission_key, scope'),
        supabase.from('permissions').select('key, module, description'),
      ])
      if (roles.error) throw roles.error
      const pm = new Map((perms.data ?? []).map((p) => [p.key as string, p as { key: string; module: string; description: string }]))
      return (roles.data ?? []).map((r) => ({
        role: r.key as string, name: r.name as string, rank: r.rank as number,
        perms: (rp.data ?? []).filter((x) => x.access_role_id === r.id).map((x) => ({ key: x.permission_key as string, scope: x.scope as string, description: pm.get(x.permission_key as string)?.description ?? x.permission_key as string, module: pm.get(x.permission_key as string)?.module ?? 'outros' }))
          .sort((a, b) => a.module.localeCompare(b.module) || a.description.localeCompare(b.description)),
      })) as Matrix[]
    },
  })
  const grouped = useMemo(() => (m: Matrix) => {
    const g: Record<string, Matrix['perms']> = {}
    for (const p of m.perms) (g[p.module] ??= []).push(p)
    return g
  }, [])
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">O que cada papel pode fazer hoje. O banco impõe estas regras mesmo que a tela esconda algo.</p>
      {isLoading && <Skeleton className="h-24" />}
      {data?.map((m) => (
        <Collapsible key={m.role} open={open === m.role} onToggle={() => setOpen(open === m.role ? null : m.role)} title={m.name} count={m.perms.length}>
          {Object.entries(grouped(m)).map(([mod, list]) => (
            <div key={mod} className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{MODULE_LABEL[mod] ?? mod}</p>
              {list.map((p) => (
                <div key={p.key} className={cn('flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1')}>
                  <span>{p.description}</span><Badge>{SCOPE_LABEL[p.scope] ?? p.scope}</Badge>
                </div>
              ))}
            </div>
          ))}
        </Collapsible>
      ))}
    </div>
  )
}

export function AccessPage() {
  const [tab, setTab] = useState<'people' | 'perms'>('people')
  return (
    <div className="space-y-4">
      <h1>Acesso e papéis</h1>
      <div className="flex gap-1" role="tablist">
        {[['people', 'Pessoas'], ['perms', 'Permissões dos papéis']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k as typeof tab)}
            className={cn('rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === k && 'bg-primary text-primary-foreground hover:bg-primary')}>{l}</button>
        ))}
      </div>
      {tab === 'people' ? <PeopleTab /> : <PermissionsTab />}
    </div>
  )
}
