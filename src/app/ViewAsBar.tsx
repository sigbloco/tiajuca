import { useQuery } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { Eye, X } from 'lucide-react'
import { useMemo, useRef, useEffect, useState } from 'react'
import { Button, Select, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { hasPermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useMemberStatus } from '@/modules/members/useMemberStatus'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface Row {
  id: string; full_name: string; display_name: string | null; user_id: string | null
  member_access_roles: { revoked_at: string | null; access_roles: { key: string } | null }[]
}
interface Staff { member_id: string; staff_kind: 'professor' | 'monitor'; section_id: string | null; instrument_id: string | null }
interface Cat { member_id: string; category_name: string }
interface Person { id: string; name: string; label: string; virtual?: { key: string; roles: string[]; inactive?: boolean } }

/** Categorias de perfil para visualizar. "Titular" (eu mesmo) é o valor vazio: sai da visualização. */
const CATEGORIES = [
  { key: 'direcao', label: 'Direção' },
  { key: 'professor', label: 'Professor' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'ativo', label: 'Integrante ativo' },
  { key: 'inativo', label: 'Integrante inativo' },
] as const
type CatKey = (typeof CATEGORIES)[number]['key']

// Sem ninguém na categoria, dá para visualizar mesmo assim: simula só os papéis (os dados continuam os seus).
const virtualRoles = (key: CatKey) => (key === 'direcao' ? ['direcao', 'integrante'] : key === 'professor' ? ['professor', 'integrante'] : key === 'monitor' ? ['monitor', 'integrante'] : ['integrante'])

/** Barra fixa no topo (só Titular/Direção): escolhe uma CATEGORIA e, depois, uma pessoa dela; a interface passa a mostrar o que ela veria. */
export function ViewAsBar() {
  const { realMembership, viewAs, viewAsLoading, setViewAs } = useOrganization()
  const allowed = !!realMembership && hasPermission(realMembership.permissions, 'roles.manage')
  const orgId = realMembership?.organization_id
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const { isInactive } = useMemberStatus()
  const barRef = useRef<HTMLDivElement>(null)
  const [chosen, setChosen] = useState<CatKey | ''>('')
  // Altura da barra, para o topo fixo do app ficar logo abaixo dela (sem sobrepor).
  useEffect(() => {
    const el = barRef.current
    document.documentElement.style.setProperty('--viewas-h', (el?.offsetHeight ?? 0) + 'px')
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--viewas-h', el.offsetHeight + 'px'))
    ro.observe(el)
    return () => ro.disconnect()
  })

  const people = useQuery({
    queryKey: ['view-as-people', orgId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, user_id, member_access_roles(revoked_at, access_roles(key))')
        .eq('organization_id', orgId!).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })
  const staff = useQuery({
    queryKey: ['view-as-staff', orgId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('member_id, staff_kind, section_id, instrument_id, cycles!inner(is_current)').eq('organization_id', orgId!).is('valid_to', null).eq('cycles.is_current', true)
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

  // Pessoas de cada categoria (sem o titular e sem você mesmo, que não mudam a visão).
  const byCategory = useMemo(() => {
    const rows = people.data ?? []
    const nameOf = (r: Row) => shortName(r.full_name, r.display_name)
    const rolesOf = (r: Row) => new Set(r.member_access_roles.filter((x) => !x.revoked_at && x.access_roles).map((x) => x.access_roles!.key))
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const secName = new Map((sections.data ?? []).map((s) => [s.id, s.name]))
    const sectionsOf = (id: string, kind: 'professor' | 'monitor') => [...new Set((staff.data ?? []).filter((a) => a.member_id === id && a.staff_kind === kind)
      .map((a) => secName.get(a.section_id ?? (a.instrument_id ? instById.get(a.instrument_id)?.section_id ?? '' : '')) ?? '').filter(Boolean))]
    const catOf = new Map<string, string>()
    for (const c of cats.data ?? []) if (!catOf.has(c.member_id)) catOf.set(c.member_id, c.category_name)
    const others = rows.filter((r) => r.id !== realMembership?.member_id && !rolesOf(r).has('titular'))
    const activeOthers = others.filter((r) => !isInactive(r.id))
    const isStaff = (r: Row) => rolesOf(r).has('professor') || rolesOf(r).has('monitor')
    const person = (r: Row, extra?: string): Person => ({ id: r.id, name: nameOf(r), label: extra ? `${nameOf(r)} · ${extra}` : nameOf(r) })
    const staffOf = (kind: 'professor' | 'monitor') => activeOthers
      .filter((r) => rolesOf(r).has(kind) || (staff.data ?? []).some((a) => a.member_id === r.id && a.staff_kind === kind))
      .map((r) => person(r, sectionsOf(r.id, kind).join(', ')))
    const out: Record<CatKey, Person[]> = {
      direcao: activeOthers.filter((r) => rolesOf(r).has('direcao')).map((r) => person(r)),
      professor: staffOf('professor'),
      monitor: staffOf('monitor'),
      ativo: others.filter((r) => !isInactive(r.id) && !isStaff(r) && !rolesOf(r).has('direcao')).map((r) => person(r, catOf.get(r.id))),
      inativo: others.filter((r) => isInactive(r.id) && !rolesOf(r).has('direcao')).map((r) => person(r, catOf.get(r.id))),
    }
    for (const c of CATEGORIES) {
      if (out[c.key].length === 0) out[c.key] = [{ id: `virtual:${c.key}`, name: c.label, label: `${c.label} (sem pessoa)`, virtual: { key: c.key, roles: virtualRoles(c.key), inactive: c.key === 'inativo' } }]
    }
    return out
  }, [people.data, staff.data, cats.data, sections.data, instruments.data, isInactive, realMembership?.member_id])

  if (!allowed) return null

  // Categoria em uso: a da pessoa visualizada (se a visualização continua depois de recarregar) ou a que acabou de ser escolhida.
  const derived = viewAs ? CATEGORIES.find((c) => byCategory[c.key].some((p) => p.id === viewAs.member_id || (!!viewAs.virtual && p.virtual?.key === viewAs.virtual.key)))?.key : undefined
  const cat: CatKey | '' = viewAs ? (derived ?? (chosen || '')) : ''
  const catLabel = CATEGORIES.find((c) => c.key === cat)?.label
  const apply = (p: Person | undefined) => setViewAs(p ? { member_id: p.id, display_name: p.name, ...(p.virtual ? { virtual: p.virtual } : {}) } : null)

  return (
    <div ref={barRef} className={cn('sticky top-0 z-50 border-b border-border px-3 py-1.5 text-sm', viewAs ? 'bg-warning text-foreground' : 'bg-muted')}>
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden shrink-0 font-semibold sm:inline">{viewAs ? 'Visualizando como' : 'Visualizar como'}</span>
        <Select
          aria-label="Categoria para visualizar"
          className="h-8 min-w-0 max-w-[12rem] flex-1 py-0 text-sm"
          value={cat}
          onChange={(e) => {
            const key = e.target.value as CatKey | ''
            setChosen(key)
            apply(key ? byCategory[key][0] : undefined)
          }}
        >
          <option value="">{realMembership?.roles.includes('titular') ? 'Titular (eu mesmo)' : 'Eu mesmo'}</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </Select>
        {cat && (
          <Select
            aria-label={`Pessoa da categoria ${catLabel}`}
            className="h-8 min-w-0 max-w-xs flex-1 py-0 text-sm"
            value={viewAs?.member_id ?? ''}
            onChange={(e) => apply(byCategory[cat].find((p) => p.id === e.target.value))}
          >
            {byCategory[cat].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        )}
        {viewAs && (
          <Button size="sm" variant="outline" className="h-8 shrink-0 bg-card" onClick={() => { setViewAs(null); setChosen('') }}>
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Voltar a mim</span><span className="sm:hidden">Sair</span>
          </Button>
        )}
      </div>
      {viewAs && (
        <p className="mt-1 text-xs">
          {viewAsLoading ? 'Carregando o acesso deste perfil' : 'Menus e telas seguem o acesso de um perfil'}{catLabel ? <>: <strong>{catLabel}</strong>{viewAs.virtual ? '' : <> · {viewAs.display_name}</>}</> : null}.
          {' '}Os dados e as ações continuam sendo os <strong>seus</strong> (você ainda é direção): confira o que o perfil vê, mas edite com cuidado.
        </p>
      )}
    </div>
  )
}
