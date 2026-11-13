import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { ReadMore } from '@/components/shared/ReadMore'
import { Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

/** Uma linha por página do sistema. `see` = permissões de ver (a página aparece no menu); `edit` = de editar. */
interface Area { label: string; see?: string[]; edit?: string[] }
const GROUPS: { title: string; areas: Area[] }[] = [
  { title: 'Dia a dia', areas: [
    { label: 'Calendário', see: ['events.read'], edit: ['events.manage'] },
    { label: 'Presença', see: ['attendance.read'], edit: ['attendance.record'] },
    { label: 'Repertório', see: ['repertoire.read'], edit: ['repertoire.manage'] },
    { label: 'Google Drive', see: ['drive.read'], edit: ['drive.manage'] },
    { label: 'Fornecedores', see: ['suppliers.read'], edit: ['suppliers.manage'] },
  ] },
  { title: 'Pessoas', areas: [
    { label: 'Integrantes', see: ['members.read'], edit: ['members.manage'] },
    { label: 'Dados sensíveis (LGPD)', see: ['members.sensitive.read'], edit: ['members.sensitive.manage'] },
    { label: 'Alunos e participação no ciclo', see: ['member_cycles.read'], edit: ['member_cycles.manage'] },
    { label: 'Vagas e lista de espera', see: ['capacity.read'], edit: ['capacity.manage'] },
    { label: 'Inscrições (formulários)', edit: ['forms.manage'] },
  ] },
  { title: 'Dinheiro', areas: [
    { label: 'Mensalidades', see: ['billing.read'], edit: ['billing.manage'] },
    { label: 'Financeiro (valores e lançamentos)', see: ['finance.read'], edit: ['finance.manage'] },
    { label: 'Pagamentos da equipe', see: ['staff_payments.read'], edit: ['staff_payments.manage'] },
    { label: 'Chave PIX própria', edit: ['pix.manage'] },
    { label: 'Bolsas', edit: ['scholarships.manage'] },
    { label: 'Loja', edit: ['shop.manage'] },
  ] },
  { title: 'Administração', areas: [
    { label: 'Ciclos, naipes e checklists', edit: ['cycles.manage', 'structure.manage', 'checklists.manage', 'staff_assignments.manage'] },
    { label: 'Site, interface e configurações', edit: ['settings.manage', 'org.manage'] },
    { label: 'Acesso e papéis', edit: ['roles.manage'] },
    { label: 'Auditoria e backups', see: ['audit.read'], edit: ['backups.manage'] },
  ] },
]

const SCOPES: [string, string][] = [['', 'Sem acesso'], ['own', 'Só o próprio'], ['group', 'Meu grupo'], ['org', 'Tudo']]

interface RoleRow { id: string; key: string; name: string; scopes: Record<string, string> }

/** Valor de um controle com várias permissões: todas iguais → esse valor; senão "mixed". */
function valueOf(keys: string[], scopes: Record<string, string>): string {
  const vals = keys.map((k) => scopes[k] ?? '')
  return vals.every((v) => v === vals[0]) ? vals[0] : 'mixed'
}

/**
 * Permissões por página: cada papel tem, por página, "Ver" (aparece no menu) e "Editar", com alcance (só o próprio, meu grupo ou tudo).
 * Direção e Titular têm tudo (fixo); o que é exclusivo da Direção aparece com cadeado.
 */
export function PermissionsMatrix() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [roleKey, setRoleKey] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['access-matrix', orgId],
    queryFn: async () => {
      const [roles, rp, locked] = await Promise.all([
        supabase.from('access_roles').select('id, key, name, rank').eq('organization_id', orgId).order('rank', { ascending: false }),
        supabase.from('role_permissions').select('access_role_id, permission_key, scope'),
        supabase.rpc('locked_permissions'),
      ])
      if (roles.error) throw roles.error
      const rows: RoleRow[] = (roles.data ?? []).map((r) => ({
        id: r.id as string, key: r.key as string, name: r.name as string,
        scopes: Object.fromEntries((rp.data ?? []).filter((x) => x.access_role_id === r.id).map((x) => [x.permission_key as string, x.scope as string])),
      }))
      return { roles: rows, locked: new Set((locked.data ?? []) as string[]) }
    },
  })
  const set = useMutation({
    mutationFn: async (changes: { role: string; permission: string; scope: string }[]) => {
      for (const c of changes) {
        const { error } = await supabase.rpc('set_role_permission', { p_org: orgId, p_role_key: c.role, p_permission: c.permission, p_scope: c.scope || null })
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success('Permissão atualizada. Vale no próximo carregamento de cada pessoa.'); qc.invalidateQueries({ queryKey: ['access-matrix', orgId] }); qc.invalidateQueries({ queryKey: ['memberships'] }) },
    onError: (e) => { toast.error(friendlyError(e)); qc.invalidateQueries({ queryKey: ['access-matrix', orgId] }) },
  })

  const roles = (data?.roles ?? []).filter((r) => r.key !== 'titular')
  const role = roles.find((r) => r.key === roleKey) ?? roles.find((r) => r.key === 'professor') ?? roles[0]
  const fixed = role?.key === 'direcao'

  /** Muda "Ver" ou "Editar" de uma página. Editar sem ver não faz sentido: editar liga o ver, e tirar o ver tira o editar. */
  const change = (area: Area, kind: 'see' | 'edit', scope: string) => {
    if (!role) return
    const out: { role: string; permission: string; scope: string }[] = []
    const put = (keys: string[] | undefined, s: string) => (keys ?? []).forEach((k) => { if (!data?.locked.has(k)) out.push({ role: role.key, permission: k, scope: s }) })
    if (kind === 'see') {
      put(area.see, scope)
      if (!scope) put(area.edit, '')
    } else {
      put(area.edit, scope)
      if (scope && area.see && valueOf(area.see, role.scopes) === '') put(area.see, scope)
    }
    if (out.length) set.mutate(out)
  }

  const control = (area: Area, kind: 'see' | 'edit') => {
    const keys = area[kind]
    if (!role || !keys) return <span className="text-muted-foreground" aria-hidden>—</span>
    const lockedKeys = keys.some((k) => data?.locked.has(k))
    if (fixed) return <span className="text-sm text-muted-foreground">Tudo</span>
    if (lockedKeys) return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-3 w-3" aria-hidden /> Só a Direção</span>
    const v = valueOf(keys, role.scopes)
    return (
      <Select className="h-8" aria-label={`${kind === 'see' ? 'Ver' : 'Editar'} ${area.label} — ${role.name}`} disabled={set.isPending} value={v} onChange={(e) => change(area, kind, e.target.value)}>
        {v === 'mixed' && <option value="mixed" disabled>Misto</option>}
        {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
    )
  }

  return (
    <div className="space-y-3">
      <ReadMore>
        Escolha o papel e defina, página por página, o que ele pode <strong>ver</strong> (a página aparece no menu) e o que pode <strong>editar</strong>, com o alcance: só o próprio, o meu grupo ou tudo.
        A <strong>Direção</strong> sempre tem tudo. O que tem cadeado é exclusivo da Direção e não muda. Editar liga o ver automaticamente.
      </ReadMore>
      {isLoading && <Skeleton className="h-24" />}
      {role && (
        <>
          <ButtonRow role="tablist" aria-label="Papel">
            {roles.map((r) => (
              <button key={r.key} role="tab" aria-selected={r.key === role.key} onClick={() => setRoleKey(r.key)}
                className={cn('min-h-10 rounded-lg px-3 py-2 font-semibold hover:bg-muted', r.key === role.key ? 'bg-primary text-primary-foreground hover:bg-primary' : 'border border-border bg-card')}>{r.name}</button>
            ))}
          </ButtonRow>
          {fixed && <p className="text-sm text-muted-foreground">Este papel sempre possui todas as permissões em toda a organização e não pode ser alterado.</p>}
          {GROUPS.map((g) => (
            <section key={g.title} className="space-y-1">
              <h3 className="text-sm font-bold uppercase text-muted-foreground">{g.title}</h3>
              <div className="grid grid-cols-[1fr_8.5rem_8.5rem] items-center gap-x-2 gap-y-1 px-1 text-xs font-semibold text-muted-foreground max-sm:hidden">
                <span /><span>Ver</span><span>Editar</span>
              </div>
              {g.areas.map((a, i) => (
                <div key={a.label} className={cn('grid items-center gap-x-2 gap-y-1 rounded-lg p-2 sm:grid-cols-[1fr_8.5rem_8.5rem]', i % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25')}>
                  <span className="font-semibold">{a.label}</span>
                  <label className="flex items-center gap-2 sm:block"><span className="w-12 shrink-0 text-xs text-muted-foreground sm:hidden">Ver</span><span className="min-w-0 flex-1 sm:block">{control(a, 'see')}</span></label>
                  <label className="flex items-center gap-2 sm:block"><span className="w-12 shrink-0 text-xs text-muted-foreground sm:hidden">Editar</span><span className="min-w-0 flex-1 sm:block">{control(a, 'edit')}</span></label>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
