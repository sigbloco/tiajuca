import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Button, Card, EmptyState, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from './CatalogEditor'
import type { CatalogTable } from './service'

type ScopeKind = 'section' | 'subsection' | 'instrument'
const SCOPE: Record<ScopeKind, { label: string; table: CatalogTable; column: string }> = {
  section: { label: 'Naipe inteiro', table: 'sections', column: 'section_id' },
  subsection: { label: 'Subnaipe', table: 'subsections', column: 'subsection_id' },
  instrument: { label: 'Instrumento', table: 'instruments', column: 'instrument_id' },
}

interface Assignment {
  id: string
  member_id: string
  staff_kind: 'professor' | 'monitor'
  valid_from: string
  members: { full_name: string; display_name: string | null } | null
  sections: { name: string } | null
  subsections: { name: string } | null
  instruments: { name: string } | null
}

/** Define o que cada professor/monitor acompanha. Naipe e subnaipe são expandidos para os instrumentos (RLS). */
export function StaffAssignments() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [memberId, setMemberId] = useState('')
  const [kind, setKind] = useState<'professor' | 'monitor'>('professor')
  const [scope, setScope] = useState<ScopeKind>('section')
  const [targetId, setTargetId] = useState('')
  const options = useCatalog(SCOPE[scope].table)

  const { data } = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('id, member_id, staff_kind, valid_from, members(full_name, display_name), sections(name), subsections(name), instruments(name)')
        .eq('organization_id', orgId)
        .is('valid_to', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Assignment[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-assignments', orgId] })

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('staff_assignments')
        .insert({ organization_id: orgId, member_id: memberId, staff_kind: kind, [SCOPE[scope].column]: targetId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Atribuição criada.')
      setMemberId('')
      refresh()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-3">
      <h2>Equipe e o que cada pessoa acompanha</h2>
      <p className="text-muted-foreground">
        Professores e monitores veem os integrantes dos instrumentos atribuídos aqui. Atribuir um naipe ou subnaipe vale para todos os seus instrumentos, e a pessoa pode ter várias atribuições.
      </p>
      <Card className="space-y-3 p-4">
        <MemberPicker value={memberId} onChange={setMemberId} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'professor' | 'monitor')} aria-label="Função">
            <option value="professor">Professor</option>
            <option value="monitor">Monitor</option>
          </Select>
          <Select value={scope} onChange={(e) => { setScope(e.target.value as ScopeKind); setTargetId('') }} aria-label="Nível">
            {Object.entries(SCOPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Alvo">
            <option value="">Selecione…</option>
            {options.data?.filter((o) => o.is_active).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        <Button disabled={!memberId || !targetId || add.isPending} onClick={() => add.mutate()}>Atribuir</Button>
        <p className="text-xs text-muted-foreground">Lembre de também conceder o papel de acesso (Professor/Monitor) à pessoa; esta tela define apenas o que ela acompanha.</p>
      </Card>
      {data?.length === 0 && <EmptyState>Nenhuma atribuição ativa.</EmptyState>}
      {(['professor', 'monitor'] as const).map((k) => {
        // Uma linha por pessoa; os instrumentos/naipes dela viram etiquetas (quem acompanha vários não se repete).
        const people = new Map<string, { id: string; name: string; items: Assignment[] }>()
        for (const a of (data ?? []).filter((x) => x.staff_kind === k)) {
          const p = people.get(a.member_id) ?? { id: a.member_id, name: a.members?.display_name ?? a.members?.full_name ?? '—', items: [] }
          p.items.push(a)
          people.set(a.member_id, p)
        }
        const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        if (list.length === 0) return null
        const target = (a: Assignment) => a.sections?.name ? `Naipe ${a.sections.name}` : a.subsections?.name ? `Subnaipe ${a.subsections.name}` : a.instruments?.name ?? ''
        return (
          <section key={k} className="space-y-2">
            <h3>{k === 'professor' ? 'Professores' : 'Monitores'} <span className="text-muted-foreground">({list.length})</span></h3>
            <ProgressiveList items={list} resetKey={k} render={(p) => (
              <Card key={p.id} className="space-y-2 p-3">
                <p className="truncate font-semibold">{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.items.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm font-semibold" title={`desde ${formatDate(a.valid_from)}`}>
                      {target(a)}
                      <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Encerrar ${target(a)} de ${p.name}`}
                        onClick={() => { if (window.confirm(`Encerrar a atribuição ${target(a)} de ${p.name}?`)) end.mutate(a.id) }}><X className="h-3.5 w-3.5" /></Button>
                    </span>
                  ))}
                </div>
              </Card>
            )} />
          </section>
        )
      })}
    </div>
  )
}
