import { useQuery } from '@tanstack/react-query'
import { Eye, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button, Select, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'

const GROUPS: { key: string; label: string }[] = [
  { key: 'titular', label: 'Titular' }, { key: 'direcao', label: 'Direção' }, { key: 'professor', label: 'Professores' },
  { key: 'monitor', label: 'Monitores' }, { key: 'integrante', label: 'Integrantes' },
]

interface Row {
  id: string; full_name: string; display_name: string | null; user_id: string | null
  member_access_roles: { revoked_at: string | null; access_roles: { key: string; rank: number } | null }[]
}

/** Barra fixa no topo (só Titular/Direção): escolhe uma pessoa e a interface passa a mostrar o que ela veria. */
export function ViewAsBar() {
  const { realMembership, viewAs, viewAsLoading, setViewAs } = useOrganization()
  const allowed = !!realMembership && hasPermission(realMembership.permissions, 'roles.manage')
  const orgId = realMembership?.organization_id

  const { data } = useQuery({
    queryKey: ['view-as-people', orgId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, user_id, member_access_roles(revoked_at, access_roles(key, rank))')
        .eq('organization_id', orgId!).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>(GROUPS.map((g) => [g.key, []]))
    for (const r of data ?? []) {
      if (r.id === realMembership?.member_id) continue
      const roles = r.member_access_roles.filter((x) => !x.revoked_at && x.access_roles).map((x) => x.access_roles!)
      const top = [...roles].sort((a, b) => b.rank - a.rank)[0]?.key ?? 'integrante'
      map.get(map.has(top) ? top : 'integrante')!.push(r)
    }
    return map
  }, [data, realMembership?.member_id])

  if (!allowed) return null
  const name = (r: Row) => r.display_name ?? r.full_name
  return (
    <div className={cn('sticky top-0 z-50 border-b border-border px-3 py-1.5 text-sm', viewAs ? 'bg-warning text-foreground' : 'bg-muted')}>
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden shrink-0 font-semibold sm:inline">{viewAs ? 'Visualizando como' : 'Visualizar como'}</span>
        <Select
          aria-label="Visualizar como"
          className="h-8 min-w-0 max-w-xs flex-1 py-0 text-sm"
          value={viewAs?.member_id ?? ''}
          onChange={(e) => {
            const row = (data ?? []).find((r) => r.id === e.target.value)
            setViewAs(row ? { member_id: row.id, display_name: name(row) } : null)
          }}
        >
          <option value="">Eu mesmo ({realMembership?.display_name})</option>
          {GROUPS.map((g) => {
            const list = grouped.get(g.key) ?? []
            return list.length === 0 ? null : (
              <optgroup key={g.key} label={g.label}>
                {list.map((r) => <option key={r.id} value={r.id}>{name(r)}{r.user_id ? '' : ' (sem conta)'}</option>)}
              </optgroup>
            )
          })}
        </Select>
        {viewAs && (
          <Button size="sm" variant="outline" className="h-8 shrink-0 bg-card" onClick={() => setViewAs(null)}>
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Voltar a mim</span><span className="sm:hidden">Sair</span>
          </Button>
        )}
      </div>
      {viewAs && (
        <p className="mt-1 text-xs">
          {viewAsLoading ? 'Carregando o acesso de ' : 'Menus e telas seguem o acesso de '}<strong>{viewAs.display_name}</strong>.
          {' '}Os dados e as ações continuam sendo os <strong>seus</strong> (você ainda é Direção): confira o que a pessoa vê, mas edite com cuidado.
        </p>
      )}
    </div>
  )
}
