import { useQuery } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { Eye, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button, Select, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useMemberStatus } from '@/modules/members/useMemberStatus'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface Row {
  id: string; full_name: string; display_name: string | null; user_id: string | null
  member_access_roles: { revoked_at: string | null; access_roles: { key: string } | null }[]
  member_artistic_links: { instrument_id: string | null; ended_at: string | null }[]
}
interface Staff { member_id: string; staff_kind: 'professor' | 'monitor'; section_id: string | null; subsection_id: string | null; instrument_id: string | null }
interface Cat { member_id: string; category_name: string }

/** Barra fixa no topo (só Titular/Direção): escolhe um PERFIL de exemplo e a interface passa a mostrar o que ele veria. */
export function ViewAsBar() {
  const { realMembership, viewAs, viewAsLoading, setViewAs } = useOrganization()
  const allowed = !!realMembership && hasPermission(realMembership.permissions, 'roles.manage')
  const orgId = realMembership?.organization_id
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const { isInactive } = useMemberStatus()

  const people = useQuery({
    queryKey: ['view-as-people', orgId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, user_id, member_access_roles(revoked_at, access_roles(key)), member_artistic_links(instrument_id, ended_at)')
        .eq('organization_id', orgId!).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })
  const staff = useQuery({
    queryKey: ['view-as-staff', orgId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('member_id, staff_kind, section_id, subsection_id, instrument_id').eq('organization_id', orgId!).is('valid_to', null)
      if (error) throw error
      return (data ?? []) as Staff[]
    },
  })
  const cats = useQuery({
    queryKey: ['members', orgId, 'categories'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_member_categories', { p_org: orgId! })
      if (error) throw error
      return (data ?? []) as Cat[]
    },
  })

  // Um exemplo de cada perfil: Direção, Professor e Monitor por naipe, Aluno por naipe e um Inativo.
  const profiles = useMemo(() => {
    const out: { key: string; label: string; id: string; name: string; disabled?: boolean }[] = []
    const rows = people.data ?? []
    const byId = new Map(rows.map((r) => [r.id, r]))
    const nameOf = (r: Row) => shortName(r?.full_name, r?.display_name)
    const rolesOf = (r: Row) => new Set(r.member_access_roles.filter((x) => !x.revoked_at && x.access_roles).map((x) => x.access_roles!.key))
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const subById = new Map((subsections.data ?? []).map((s) => [s.id, s]))
    const secList = (sections.data ?? []).filter((s) => s.is_active)
    const sectionOfStaff = (a: Staff) => a.section_id ?? (a.subsection_id ? subById.get(a.subsection_id)?.section_id : null) ?? (a.instrument_id ? instById.get(a.instrument_id)?.section_id : null) ?? null
    const sectionOfLinks = (r: Row) => r.member_artistic_links.filter((l) => !l.ended_at).map((l) => (l.instrument_id ? instById.get(l.instrument_id)?.section_id : null)).filter(Boolean) as string[]
    const add = (key: string, label: string, r: Row | undefined) => {
      if (r && r.id !== realMembership?.member_id) out.push({ key, label, id: r.id, name: nameOf(r) })
      else out.push({ key, label, id: '', name: '', disabled: true }) // sem ninguém para representar o perfil: aparece apagado
    }
    const active = (r: Row) => !isInactive(r.id)
    const used = new Set<string>()
    const pick = (list: Row[]) => { const r = list.find((x) => !used.has(x.id)) ?? list[0]; if (r) used.add(r.id); return r }
    const isStaff = (r: Row) => rolesOf(r).has('monitor') || rolesOf(r).has('professor')

    add('direcao', 'Direção', pick(rows.filter((r) => rolesOf(r).has('direcao') && !rolesOf(r).has('titular') && active(r))))
    for (const kind of ['professor', 'monitor'] as const) {
      for (const sec of secList) {
        const candidates = (staff.data ?? []).filter((a) => a.staff_kind === kind && sectionOfStaff(a) === sec.id).map((a) => byId.get(a.member_id)).filter((r): r is Row => !!r && active(r) && rolesOf(r).has(kind))
        add(`${kind}:${sec.id}`, `${kind === 'professor' ? 'Professor' : 'Monitor'} (${sec.name})`, pick(candidates))
      }
    }
    // Músico e Senior enxergam o mesmo: um só perfil.
    const musico = new Set((cats.data ?? []).filter((c) => c.category_name === 'Senior' || c.category_name === 'Músico').map((c) => c.member_id))
    add('musico', 'Músico/Senior', pick(rows.filter((x) => musico.has(x.id) && active(x) && !isStaff(x) && !rolesOf(x).has('direcao'))))
    // Alunos: Sopro por afinação (C, Eb, Bb) e Percussão.
    const aluno = new Set((cats.data ?? []).filter((c) => c.category_name === 'Aluno').map((c) => c.member_id))
    const alunos = rows.filter((x) => aluno.has(x.id) && active(x) && !isStaff(x))
    const linkInsts = (r: Row) => r.member_artistic_links.filter((l) => !l.ended_at && l.instrument_id).map((l) => instById.get(l.instrument_id!)).filter(Boolean) as { section_id?: string | null; tuning?: string | null }[]
    const sopro = secList.find((x) => /sopro/i.test(x.name))
    const percussao = secList.find((x) => /percuss/i.test(x.name))
    for (const t of ['C', 'Eb', 'Bb']) {
      add(`aluno:sopro:${t}`, `Aluno (Sopro: ${t})`, sopro ? pick(alunos.filter((x) => linkInsts(x).some((i) => i.section_id === sopro.id && i.tuning === t))) : undefined)
    }
    add('aluno:percussao', 'Aluno (Percussão)', percussao ? pick(alunos.filter((x) => sectionOfLinks(x).includes(percussao.id))) : undefined)
    const ina = pick(rows.filter((x) => isInactive(x.id) && !rolesOf(x).has('direcao') && !rolesOf(x).has('titular')))
    add('inativo', 'Inativo', ina)
    return out
  }, [people.data, staff.data, cats.data, sections.data, subsections.data, instruments.data, isInactive, realMembership?.member_id])

  if (!allowed) return null
  const selected = profiles.find((p) => p.id === viewAs?.member_id)
  return (
    <div className={cn('sticky top-0 z-50 border-b border-border px-3 py-1.5 text-sm', viewAs ? 'bg-warning text-foreground' : 'bg-muted')}>
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden shrink-0 font-semibold sm:inline">{viewAs ? 'Visualizando como' : 'Visualizar como'}</span>
        <Select
          aria-label="Visualizar como"
          className="h-8 min-w-0 max-w-sm flex-1 py-0 text-sm"
          value={selected?.key ?? ''}
          onChange={(e) => {
            const p = profiles.find((x) => x.key === e.target.value)
            setViewAs(p ? { member_id: p.id, display_name: p.name } : null)
          }}
        >
          <option value="">{realMembership?.roles.includes('titular') ? 'Titular' : 'Eu mesmo'} (eu mesmo)</option>
          {profiles.map((p) => <option key={p.key} value={p.key} disabled={p.disabled}>{p.label}{p.disabled ? ' (ninguém neste perfil)' : ''}</option>)}
        </Select>
        {viewAs && (
          <Button size="sm" variant="outline" className="h-8 shrink-0 bg-card" onClick={() => setViewAs(null)}>
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Voltar a mim</span><span className="sm:hidden">Sair</span>
          </Button>
        )}
      </div>
      {viewAs && (
        <p className="mt-1 text-xs">
          {viewAsLoading ? 'Carregando o acesso de ' : 'Menus e telas seguem o acesso de '}<strong>{viewAs.display_name}</strong>
          {selected ? <> ({selected.label})</> : null}.
          {' '}Os dados e as ações continuam sendo os <strong>seus</strong> (você ainda é Direção): confira o que o perfil vê, mas edite com cuidado.
        </p>
      )}
    </div>
  )
}
