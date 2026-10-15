import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Crown, Lock, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { Badge, Button, Card, EmptyState, Input, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { listMembers } from '@/modules/members/service'

const ROLES = [
  { key: 'direcao', label: 'Direção' }, { key: 'professor', label: 'Professor' },
  { key: 'monitor', label: 'Monitor' }, { key: 'integrante', label: 'Integrante' },
] as const
const SCOPE_LABEL: Record<string, string> = { org: 'Toda a organização', group: 'Seu grupo', own: 'Apenas o próprio' }
const MODULE_LABEL: Record<string, string> = {
  organizacao: 'Organização', configuracoes: 'Configurações', acesso: 'Acesso', membros: 'Integrantes', auditoria: 'Auditoria', estrutura: 'Estrutura',
  ciclos: 'Ciclos', vagas: 'Vagas', eventos: 'Eventos', presenca: 'Presença', mensalidades: 'Mensalidades', financeiro: 'Financeiro',
  repertorio: 'Repertório', inscricoes: 'Inscrições',
}

function useIsTitular() {
  const { membership } = useOrganization()
  return Boolean(membership?.roles.includes('titular'))
}

/** O bloco já tem titular? Então só ele mexe na Direção. */
function useOrgHasTitular() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['org-has-titular', orgId],
    queryFn: async () => {
      const { count, error } = await supabase.from('member_access_roles')
        .select('id, access_roles!inner(key)', { count: 'exact', head: true }).eq('organization_id', orgId).eq('access_roles.key', 'titular').is('revoked_at', null)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

function TransferSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [to, setTo] = useState('')
  const transfer = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('transfer_titular', { p_org: orgId, p_to_member: to }); if (error) throw error },
    onSuccess: () => { toast.success('Titularidade transferida. Você deixou de ser o titular.'); qc.invalidateQueries(); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Transferir titularidade" description="A nova pessoa passa a controlar tudo, inclusive a Direção. Você perde esse papel e todas as permissões ligadas a ele.">
      <MemberPicker value={to} onChange={setTo} />
      <p className="text-xs text-muted-foreground">A pessoa precisa ter conta de acesso vinculada ao cadastro.</p>
      <Button disabled={!to || transfer.isPending} onClick={() => { if (window.confirm('Transferir a titularidade do bloco? Esta ação só pode ser desfeita pelo novo titular.')) transfer.mutate() }}>Transferir titularidade</Button>
    </SheetContent>
  )
}

function PeopleTab() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const isTitular = useIsTitular()
  const hasTitular = useOrgHasTitular()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [transfer, setTransfer] = useState(false)
  useEffect(() => { const t = setTimeout(() => { setSearch(input); setPage(0) }, 300); return () => clearTimeout(t) }, [input])
  const canTouchDirection = isTitular || hasTitular.data === false

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
      {hasTitular.data && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /> O bloco tem um <strong>titular</strong>: só ele concede ou remove a Direção.</p>
          {isTitular && <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>Transferir titularidade</Button>}
        </Card>
      )}
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
                <p className="flex items-center gap-1.5 truncate font-semibold">{mine.has('titular') && <Crown className="h-4 w-4 shrink-0 text-primary" aria-label="Titular do bloco" />}{m.display_name ?? m.full_name}</p>
                <div className="flex gap-1">{mine.has('titular') && <Badge className="bg-primary/15 text-primary">Titular</Badge>}{!m.user_id && <Badge>Sem conta de acesso</Badge>}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => {
                  const on = mine.has(r.key)
                  const blocked = r.key === 'direcao' && !canTouchDirection
                  return (
                    <Button key={r.key} size="sm" variant={on ? 'default' : 'outline'} disabled={toggle.isPending || blocked} aria-pressed={on}
                      title={blocked ? 'Somente o titular do bloco concede ou remove a Direção' : undefined}
                      onClick={() => {
                        if (on && r.key === 'direcao' && !window.confirm('Remover o papel de Direção desta pessoa?')) return
                        toggle.mutate({ member: m.id, role: r.key, on: !on })
                      }}>
                      {blocked && <Lock className="h-3 w-3" />}{r.label}
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
      <Sheet open={transfer} onOpenChange={setTransfer}>{transfer && <TransferSheet onClose={() => setTransfer(false)} />}</Sheet>
    </div>
  )
}

interface PermRow { key: string; module: string; description: string }
interface RoleRow { id: string; key: string; name: string; rank: number; scopes: Record<string, string> }

/** Matriz papel × permissão. Direção e Titular têm tudo (fixo); permissões críticas são exclusivas deles. */
function PermissionsTab() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['access-matrix', orgId],
    queryFn: async () => {
      const [roles, rp, perms, locked] = await Promise.all([
        supabase.from('access_roles').select('id, key, name, rank').eq('organization_id', orgId).order('rank', { ascending: false }),
        supabase.from('role_permissions').select('access_role_id, permission_key, scope'),
        supabase.from('permissions').select('key, module, description').order('module').order('description'),
        supabase.rpc('locked_permissions'),
      ])
      if (roles.error) throw roles.error
      if (perms.error) throw perms.error
      const rows: RoleRow[] = (roles.data ?? []).map((r) => ({
        id: r.id as string, key: r.key as string, name: r.name as string, rank: r.rank as number,
        scopes: Object.fromEntries((rp.data ?? []).filter((x) => x.access_role_id === r.id).map((x) => [x.permission_key as string, x.scope as string])),
      }))
      return { roles: rows, perms: (perms.data ?? []) as PermRow[], locked: new Set((locked.data ?? []) as string[]) }
    },
  })
  const set = useMutation({
    mutationFn: async ({ role, permission, scope }: { role: string; permission: string; scope: string }) => {
      const { error } = await supabase.rpc('set_role_permission', { p_org: orgId, p_role_key: role, p_permission: permission, p_scope: scope || null })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Permissão atualizada. Vale no próximo carregamento de cada pessoa.'); qc.invalidateQueries({ queryKey: ['access-matrix', orgId] }); qc.invalidateQueries({ queryKey: ['memberships'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const byModule = useMemo(() => {
    const g: Record<string, PermRow[]> = {}
    for (const p of data?.perms ?? []) (g[p.module] ??= []).push(p)
    return g
  }, [data])

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Defina o que cada papel pode fazer e com qual alcance. <strong>Direção e Titular</strong> sempre têm tudo. Permissões marcadas com cadeado (financeiro, dados sensíveis, papéis, auditoria, inscrições…) são exclusivas da Direção. O banco impõe estas regras mesmo que a tela esconda algo.</p>
      {isLoading && <Skeleton className="h-24" />}
      {data?.roles.map((role) => {
        const fixed = role.key === 'direcao' || role.key === 'titular'
        return (
          <Collapsible key={role.key} open={open === role.key} onToggle={() => setOpen(open === role.key ? null : role.key)} title={role.name} count={Object.keys(role.scopes).length}
            right={fixed ? <Badge><Lock className="mr-1 h-3 w-3" />Fixo</Badge> : undefined}>
            {fixed && <p className="text-muted-foreground">Este papel sempre possui todas as permissões em toda a organização e não pode ser alterado.</p>}
            {Object.entries(byModule).map(([mod, list]) => (
              <div key={mod} className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{MODULE_LABEL[mod] ?? mod}</p>
                {list.map((p) => {
                  const locked = data.locked.has(p.key)
                  const disabled = fixed || locked || set.isPending
                  return (
                    <div key={p.key} className={cn('flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1')}>
                      <span className="flex items-center gap-1.5">{locked && !fixed && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Exclusiva da Direção" />}{p.description}</span>
                      <Select className="h-8 w-44" aria-label={`${p.description} — ${role.name}`} disabled={disabled}
                        value={fixed ? 'org' : (locked ? '' : (role.scopes[p.key] ?? ''))}
                        onChange={(e) => set.mutate({ role: role.key, permission: p.key, scope: e.target.value })}>
                        <option value="">{locked && !fixed ? 'Exclusiva da Direção' : 'Sem acesso'}</option>
                        {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </div>
                  )
                })}
              </div>
            ))}
          </Collapsible>
        )
      })}
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
