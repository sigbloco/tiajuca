import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AutoComplete, Chip, type AutoOption } from '@/components/shared/AutoComplete'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Badge, Button, Card, EmptyState, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifyChange } from '@/core/undo'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useMemberStatus } from '@/modules/members/useMemberStatus'
import { useCatalog } from './CatalogEditor'

type Kind = 'professor' | 'monitor'
type ScopeKind = 'section' | 'subsection' | 'instrument'
const COLUMN: Record<Kind, string> = { professor: 'Professores', monitor: 'Monitores' }
const COLUMN_COLUMN: Record<ScopeKind, string> = { section: 'section_id', subsection: 'subsection_id', instrument: 'instrument_id' }

interface Assignment {
  id: string
  member_id: string
  staff_kind: Kind
  section_id: string | null
  subsection_id: string | null
  instrument_id: string | null
  members: { full_name: string; display_name: string | null } | null
}
const scopeOf = (a: Assignment): { kind: ScopeKind; id: string } =>
  a.section_id ? { kind: 'section', id: a.section_id } : a.subsection_id ? { kind: 'subsection', id: a.subsection_id } : { kind: 'instrument', id: a.instrument_id! }

/** Equipe: professores e monitores lado a lado. Cada pessoa aparece uma vez, com o que acompanha em chips; escreva para adicionar mais. */
export function StaffAssignments() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const { isInactive } = useMemberStatus()
  // Pessoas escolhidas para entrar na equipe que ainda não têm nenhuma atribuição.
  const [drafts, setDrafts] = useState<Record<Kind, string[]>>({ professor: [], monitor: [] })
  const [editing, setEditing] = useState<string | null>(null) // "kind:memberId" com o campo de adicionar aberto

  const { data } = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('id, member_id, staff_kind, section_id, subsection_id, instrument_id, members(full_name, display_name)')
        .eq('organization_id', orgId)
        .is('valid_to', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Assignment[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-assignments', orgId] })

  const options = useMemo<AutoOption[]>(() => {
    const secName = new Map((sections.data ?? []).map((s) => [s.id, s.name]))
    return [
      ...(sections.data ?? []).filter((s) => s.is_active).map((s) => ({ id: `section:${s.id}`, label: s.name, hint: 'Naipe inteiro' })),
      ...(subsections.data ?? []).filter((s) => s.is_active).map((s) => ({ id: `subsection:${s.id}`, label: s.name, hint: `Subnaipe · ${secName.get(s.section_id ?? '') ?? ''}` })),
      ...(instruments.data ?? []).filter((i) => i.is_active).map((i) => ({ id: `instrument:${i.id}`, label: i.name, hint: secName.get(i.section_id ?? '') ?? 'Instrumento' })),
    ]
  }, [sections.data, subsections.data, instruments.data])
  const labelOf = (s: { kind: ScopeKind; id: string }) => options.find((o) => o.id === `${s.kind}:${s.id}`)?.label ?? '…'

  const add = useMutation({
    mutationFn: async (v: { member: string; kind: Kind; scope: ScopeKind; target: string }) => {
      const { data, error } = await supabase.from('staff_assignments')
        .insert({ organization_id: orgId, member_id: v.member, staff_kind: v.kind, [COLUMN_COLUMN[v.scope]]: v.target }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id, v) => {
      refresh()
      setDrafts((d) => ({ ...d, [v.kind]: d[v.kind].filter((m) => m !== v.member) }))
      notifyChange('Atribuição criada.', async () => {
        const { error } = await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      refresh()
      notifyChange('Atribuição encerrada.', async () => {
        const { error } = await supabase.from('staff_assignments').update({ valid_to: null }).eq('id', id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const column = (kind: Kind) => {
    const people = new Map<string, { id: string; name: string; items: Assignment[] }>()
    for (const a of (data ?? []).filter((x) => x.staff_kind === kind)) {
      const p = people.get(a.member_id) ?? { id: a.member_id, name: a.members?.display_name ?? a.members?.full_name ?? '—', items: [] }
      p.items.push(a)
      people.set(a.member_id, p)
    }
    for (const m of drafts[kind]) if (!people.has(m)) people.set(m, { id: m, name: 'Nova pessoa', items: [] })
    // Ativos primeiro; quem está inativo vai para o fim, esmaecido.
    const list = [...people.values()].sort((a, b) => Number(isInactive(a.id)) - Number(isInactive(b.id)) || a.name.localeCompare(b.name, 'pt-BR'))
    return (
      <section key={kind} className="space-y-2">
        <h3>{COLUMN[kind]} <span className="text-muted-foreground">({list.length})</span></h3>
        <MemberPicker value="" onChange={(id) => { if (id) setDrafts((d) => ({ ...d, [kind]: d[kind].includes(id) ? d[kind] : [...d[kind], id] })); if (id) setEditing(`${kind}:${id}`) }} />
        {list.length === 0 && <EmptyState>Ninguém ainda. Busque uma pessoa acima.</EmptyState>}
        <ProgressiveList items={list} resetKey={kind} render={(p) => {
          const inactive = isInactive(p.id)
          const have = new Set(p.items.map((a) => `${scopeOf(a).kind}:${scopeOf(a).id}`))
          const key = `${kind}:${p.id}`
          const isEditing = editing === key || p.items.length === 0
          return (
            <Card key={p.id} className={cn('space-y-2 p-3', inactive && 'bg-muted/60 opacity-75')}>
              <div className="flex items-center justify-between gap-2">
                <p className={cn('min-w-0 truncate font-semibold', inactive && 'font-medium text-muted-foreground')}>
                  <PersonName id={p.id} fallback={p.name} /> {inactive && <Badge>Inativo</Badge>}
                </p>
                <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing(isEditing && p.items.length > 0 ? null : key)}><Pencil className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.items.map((a) => {
                  const sc = scopeOf(a)
                  return <Chip key={a.id} label={labelOf(sc)} onRemove={isEditing ? () => end.mutate(a.id) : undefined} removeLabel={`Encerrar ${labelOf(sc)} de ${p.name}`} />
                })}
                {p.items.length === 0 && <span className="inline-flex items-center gap-1 text-muted-foreground"><UserPlus className="h-4 w-4" /> Escreva o instrumento ou naipe que acompanha</span>}
              </div>
              {isEditing && (
                <AutoComplete aria-label={`Adicionar instrumento ou naipe para ${p.name}`} placeholder="Escreva um instrumento, subnaipe ou naipe…"
                  options={options.filter((o) => !have.has(o.id))}
                  onPick={(o) => { const [scope, target] = o.id.split(':'); add.mutate({ member: p.id, kind, scope: scope as ScopeKind, target }) }} />
              )}
            </Card>
          )
        }} />
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <h2>Equipe e o que cada pessoa acompanha</h2>
      <p className="text-muted-foreground">
        Professores e monitores veem os integrantes dos instrumentos que acompanham. Naipe ou subnaipe valem para todos os seus instrumentos.
        Clique no lápis, escreva o nome do instrumento e escolha: ele vira um chip. Para tirar, clique no ×.
        Lembre de também conceder o papel de acesso (Professor/Monitor) em <strong>Acesso e papéis</strong>.
      </p>
      <div className="grid gap-4 md:grid-cols-2">{column('professor')}{column('monitor')}</div>
    </div>
  )
}

/** Nome da pessoa escolhida (usado nos rascunhos, antes de existir qualquer atribuição). */
function PersonName({ id, fallback }: { id: string; fallback: string }) {
  const orgId = useOrgId()
  const { data } = useQuery({
    queryKey: ['members', orgId, 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; display_name: string | null }[]
    },
  })
  const m = data?.find((x) => x.id === id)
  return <>{m ? (m.display_name ?? m.full_name) : fallback}</>
}
