import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Select } from '@/components/ui/primitives'
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
        .select('id, staff_kind, valid_from, members(full_name, display_name), sections(name), subsections(name), instruments(name)')
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
      <div className="grid gap-2">
        {data?.map((a) => (
          <Card key={a.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{a.members?.display_name ?? a.members?.full_name}</p>
              <p className="text-muted-foreground">
                <Badge>{a.staff_kind === 'professor' ? 'Professor' : 'Monitor'}</Badge>{' '}
                {a.sections?.name ? `Naipe ${a.sections.name}` : a.subsections?.name ? `Subnaipe ${a.subsections.name}` : a.instruments?.name} · desde {formatDate(a.valid_from)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => end.mutate(a.id)}>Encerrar</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
