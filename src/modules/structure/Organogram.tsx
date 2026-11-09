import { useQuery } from '@tanstack/react-query'
import { MemberLink } from '@/modules/members/MemberLink'
import { Crown, GraduationCap, Users } from 'lucide-react'
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { usePersonLabeler } from '@/modules/members/personLabel'
import { hasTuning } from '@/modules/repertoire/service'
import { useCatalog } from './CatalogEditor'
import { byOrder } from './StructureManagers'

type Kind = 'regente' | 'professor' | 'monitor'
interface Assignment { id: string; member_id: string; staff_kind: Kind; section_id: string | null; subsection_id: string | null; instrument_id: string | null; members: { full_name: string; display_name: string | null } | null }
const ORDER: Kind[] = ['regente', 'professor', 'monitor']
const LABEL: Record<Kind, string> = { regente: 'Regente', professor: 'Professor', monitor: 'Monitor' }

/** Naipes → Organograma: naipes, subnaipes e instrumentos com seus regentes, professores e monitores. Só leitura. */
export function Organogram() {
  const orgId = useOrgId()
  const labeler = usePersonLabeler()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const staff = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('id, member_id, staff_kind, section_id, subsection_id, instrument_id, members(full_name, display_name), cycles!inner(is_current)')
        .eq('organization_id', orgId).is('valid_to', null).eq('cycles.is_current', true).limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as Assignment[]
    },
  })
  const people = (pick: (a: Assignment) => boolean, size: 'sm' | 'md' = 'md') => {
    const list = (staff.data ?? []).filter(pick).sort((a, b) => ORDER.indexOf(a.staff_kind) - ORDER.indexOf(b.staff_kind))
    if (list.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((a) => (
          <Badge key={a.id} className={size === 'sm' ? 'text-xs' : ''}>
            {a.staff_kind === 'regente' ? <Crown className="mr-1 h-3 w-3" /> : a.staff_kind === 'professor' ? <GraduationCap className="mr-1 h-3 w-3" /> : <Users className="mr-1 h-3 w-3" />}
            <MemberLink id={a.member_id}>{labeler(a.members ?? { full_name: '', display_name: null })}</MemberLink> · {LABEL[a.staff_kind]}
          </Badge>
        ))}
      </div>
    )
  }
  const secs = (sections.data ?? []).filter((s) => s.is_active).sort(byOrder)
  const loading = sections.isLoading || staff.isLoading
  return (
    <div className="space-y-4">
      <div><h1>Organograma</h1><p className="text-muted-foreground">Naipes e instrumentos com seus regentes, professores e monitores. Para mudar, volte a Naipes e instrumentos.</p></div>
      {loading && <Skeleton className="h-32" />}
      {!loading && secs.length === 0 && <EmptyState>Nenhum naipe cadastrado.</EmptyState>}
      <div className="grid gap-4 md:grid-cols-2">
        {secs.map((s) => {
          const insts = (instruments.data ?? []).filter((i) => i.section_id === s.id && i.is_active).sort(byOrder)
          const instLine = (i: (typeof insts)[number]) => (
            <li key={i.id} className="space-y-1">
              <p className="font-semibold">{i.name}{hasTuning(i.tuning) ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{i.tuning}</span> : null}</p>
              {people((a) => a.instrument_id === i.id, 'sm')}
            </li>
          )
          return (
            <Card key={s.id} className="space-y-3 p-4">
              <h2 className="text-primary">{s.name}</h2>
              {people((a) => a.section_id === s.id)}
              {insts.length > 0 && <ul className="space-y-2 border-l-2 border-border pl-3">{insts.map(instLine)}</ul>}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
