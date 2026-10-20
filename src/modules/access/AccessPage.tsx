import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { Button, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { PeopleTab } from './PeopleTab'

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

function PeopleTabContainer() {
  const isTitular = useIsTitular()
  const hasTitular = useOrgHasTitular()
  const [transfer, setTransfer] = useState(false)
  return (
    <>
      <PeopleTab canTouchDirection={isTitular || hasTitular.data === false} hasTitular={Boolean(hasTitular.data)} isTitular={isTitular} onTransfer={() => setTransfer(true)} />
      <Sheet open={transfer} onOpenChange={setTransfer}>{transfer && <TransferSheet onClose={() => setTransfer(false)} />}</Sheet>
    </>
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
      <p className="text-muted-foreground">Defina o que cada papel pode fazer e com qual alcance. A <strong>Direção</strong> sempre tem tudo. Permissões marcadas com cadeado (financeiro, dados sensíveis, papéis, auditoria, inscrições…) são exclusivas da Direção. O banco impõe estas regras mesmo que a tela esconda algo.</p>
      {isLoading && <Skeleton className="h-24" />}
      {data?.roles.filter((r) => r.key !== 'titular').map((role) => {
        const fixed = role.key === 'direcao'
        return (
          <Collapsible key={role.key} open={open === role.key} onToggle={() => setOpen(open === role.key ? null : role.key)} title={role.name} count={Object.keys(role.scopes).length}
            >
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
      {tab === 'people' ? <PeopleTabContainer /> : <PermissionsTab />}
    </div>
  )
}
