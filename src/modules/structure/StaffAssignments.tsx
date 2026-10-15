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

interface Assignment {
  id: string
  staff_kind: 'professor' | 'monitor'
  valid_from: string
  members: { full_name: string; display_name: string | null } | null
  sections: { name: string } | null
}

/** Define quais naipes cada professor/monitor acompanha (base do escopo "grupo" no RLS). */
export function StaffAssignments() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const [memberId, setMemberId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [kind, setKind] = useState<'professor' | 'monitor'>('professor')

  const { data } = useQuery({
    queryKey: ['staff-assignments', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_section_assignments')
        .select('id, staff_kind, valid_from, members(full_name, display_name), sections(name)')
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
        .from('staff_section_assignments')
        .insert({ organization_id: orgId, member_id: memberId, section_id: sectionId, staff_kind: kind })
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
      const { error } = await supabase.from('staff_section_assignments').update({ valid_to: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-3">
      <h2>Equipe e naipes acompanhados</h2>
      <p className="text-muted-foreground">Professores e monitores veem os integrantes dos naipes atribuídos aqui. Um naipe pode ter vários, e uma pessoa pode acompanhar vários naipes.</p>
      <Card className="space-y-3 p-4">
        <MemberPicker value={memberId} onChange={setMemberId} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'professor' | 'monitor')} aria-label="Função">
            <option value="professor">Professor</option>
            <option value="monitor">Monitor</option>
          </Select>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Naipe">
            <option value="">Naipe…</option>
            {sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <Button disabled={!memberId || !sectionId || add.isPending} onClick={() => add.mutate()}>Atribuir</Button>
        <p className="text-xs text-muted-foreground">Lembre de também conceder o papel de acesso (Professor/Monitor) à pessoa; esta tela define apenas os naipes.</p>
      </Card>
      {data?.length === 0 && <EmptyState>Nenhuma atribuição ativa.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((a) => (
          <Card key={a.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{a.members?.display_name ?? a.members?.full_name}</p>
              <p className="text-muted-foreground"><Badge>{a.staff_kind === 'professor' ? 'Professor' : 'Monitor'}</Badge> {a.sections?.name} · desde {formatDate(a.valid_from)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => end.mutate(a.id)}>Encerrar</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
