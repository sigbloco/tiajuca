import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Collapsible, TONES, type Tone } from '@/components/shared/Collapsible'
import { Badge, EmptyState, Skeleton, cn } from '@/components/ui/primitives'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { CHARGE_STATUS_CLASS, CHARGE_STATUS_LABEL, listAllCharges, type Charge } from '@/modules/billing/service'
import { usePersonLabeler } from '@/modules/members/personLabel'
import { useCatalog } from '@/modules/structure/CatalogEditor'

const STAFF_ROLES = ['titular', 'direcao', 'professor', 'monitor']

/**
 * Receitas de mensalidades agrupadas: naipe → subnaipe → pessoas, cada uma com a etiqueta da categoria (aluno, sênior, músico, pernalta…).
 * Quem não contribui por fazer parte da organização (Direção, professores, monitores, regentes e a categoria de equipe) não aparece.
 */
export function ReceiptsByGroup({ competence }: { competence: string }) {
  const orgId = useOrgId()
  const labeler = usePersonLabeler()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const charges = useQuery({ queryKey: ['billing', orgId, 'all', competence], queryFn: () => listAllCharges(orgId, competence) })
  const links = useQuery({
    queryKey: ['billing', orgId, 'links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_artistic_links').select('member_id, instrument_id, started_at, ended_at').eq('organization_id', orgId).not('instrument_id', 'is', null).limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; instrument_id: string; started_at: string; ended_at: string | null }[]
    },
  })
  const staff = useQuery({
    queryKey: ['finance', orgId, 'non-contributors'],
    queryFn: async () => {
      const [roles, assignments] = await Promise.all([
        supabase.from('member_access_roles').select('member_id, access_roles!inner(key)').eq('organization_id', orgId).is('revoked_at', null).in('access_roles.key', STAFF_ROLES).limit(3000),
        supabase.from('staff_assignments').select('member_id').eq('organization_id', orgId).is('valid_to', null).limit(3000),
      ])
      if (roles.error) throw roles.error
      if (assignments.error) throw assignments.error
      return new Set([...(roles.data ?? []).map((r) => r.member_id as string), ...(assignments.data ?? []).map((r) => r.member_id as string)])
    },
  })

  const tree = useMemo(() => {
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const monthStart = competence, monthEnd = competence.slice(0, 8) + '31'
    const byMember = new Map<string, NonNullable<typeof links.data>>()
    for (const l of links.data ?? []) (byMember.get(l.member_id) ?? byMember.set(l.member_id, []).get(l.member_id)!).push(l)
    const placeOf = (memberId: string) => {
      const ls = byMember.get(memberId) ?? []
      const pick = ls.find((l) => l.started_at <= monthEnd && (!l.ended_at || l.ended_at >= monthStart)) ?? [...ls].sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
      const inst = pick ? instById.get(pick.instrument_id) : undefined
      return { section: inst?.section_id ?? '', sub: inst?.subsection_id ?? '' }
    }
    const isStaffCategory = (name?: string) => !!name && /equipe|monitor/i.test(name)
    const map = new Map<string, Map<string, Charge[]>>()
    let total = 0
    for (const c of charges.data ?? []) {
      if (c.status === 'cancelled') continue
      if (staff.data?.has(c.member_id) || isStaffCategory(c.fee_categories?.name)) continue
      const { section, sub } = placeOf(c.member_id)
      const inner = map.get(section) ?? new Map<string, Charge[]>()
      ;(inner.get(sub) ?? inner.set(sub, []).get(sub)!).push(c)
      map.set(section, inner)
      total++
    }
    return { map, total }
  }, [charges.data, links.data, instruments.data, staff.data, competence])

  const secList = [...(sections.data ?? []).filter((s) => tree.map.has(s.id)).sort((a, b) => a.sort_order - b.sort_order), ...(tree.map.has('') ? [{ id: '', name: 'Sem naipe' }] : [])]
  const subName = (id: string) => (subsections.data ?? []).find((s) => s.id === id)?.name ?? 'Sem subnaipe'
  const subOrder = (id: string) => (subsections.data ?? []).find((s) => s.id === id)?.sort_order ?? 9999
  const loading = charges.isLoading || sections.isLoading || staff.isLoading

  const row = (c: Charge) => (
    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
      <p className="min-w-0 truncate font-semibold">
        {labeler(c.members ?? { full_name: '', display_name: null })} {c.fee_categories?.name && <Badge className="bg-muted">{c.fee_categories.name}</Badge>}
      </p>
      <span className="flex items-center gap-2">
        <span className="font-semibold">{formatCurrency(c.final_amount)}</span>
        <Badge className={CHARGE_STATUS_CLASS[c.status]}>{CHARGE_STATUS_LABEL[c.status]}</Badge>
      </span>
    </div>
  )
  const sum = (list: Charge[], status?: Charge['status']) => list.filter((c) => !status || c.status === status).reduce((n, c) => n + c.final_amount, 0)

  return (
    <div className="space-y-2">
      <h2>Mensalidades por naipe <span className="text-base font-normal text-muted-foreground">· {tree.total} {tree.total === 1 ? 'pessoa' : 'pessoas'}</span></h2>
      <p className="text-muted-foreground">Quem não contribui por fazer parte da organização (Direção, professores, monitores e regentes) não aparece aqui.</p>
      {loading && <Skeleton className="h-24" />}
      {!loading && tree.total === 0 && <EmptyState>Nenhuma cobrança de contribuinte neste mês. Em Financeiro → Mensalidades, use “Gerar cobranças”.</EmptyState>}
      {secList.map((sec, idx) => {
        const subs = tree.map.get(sec.id)!
        const all = [...subs.values()].flat()
        const tone: Tone = TONES[idx % TONES.length]
        const k = `s:${sec.id}`
        const subKeys = [...subs.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : subOrder(a) - subOrder(b)))
        return (
          <Collapsible key={k} tone={tone} title={sec.name} count={all.length} open={open[k] ?? false} onToggle={() => setOpen((o) => ({ ...o, [k]: !(o[k] ?? false) }))}
            right={<span className="hidden text-sm sm:inline"><span className="font-semibold text-success">{formatCurrency(sum(all, 'paid'))}</span> <span className="text-muted-foreground">de {formatCurrency(sum(all))}</span></span>}>
            {subKeys.map((sk) => {
              const list = (subs.get(sk) ?? []).slice().sort((a, b) => labeler(a.members ?? { full_name: '', display_name: null }).localeCompare(labeler(b.members ?? { full_name: '', display_name: null }), 'pt-BR'))
              if (sk === '') return <div key={`${k}:none`} className="space-y-1.5">{list.map(row)}</div>
              const kk = `${k}:${sk}`
              return (
                <Collapsible key={kk} level={1} tone={tone} title={subName(sk)} count={list.length} open={open[kk] ?? false} onToggle={() => setOpen((o) => ({ ...o, [kk]: !(o[kk] ?? false) }))}
                  right={<span className={cn('hidden text-sm sm:inline')}><span className="font-semibold text-success">{formatCurrency(sum(list, 'paid'))}</span> <span className="text-muted-foreground">de {formatCurrency(sum(list))}</span></span>}>
                  <div className="space-y-1.5">{list.map(row)}</div>
                </Collapsible>
              )
            })}
          </Collapsible>
        )
      })}
    </div>
  )
}
