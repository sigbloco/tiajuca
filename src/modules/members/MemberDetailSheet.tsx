import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Select, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { setMemberCycleStatus, useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import type { MemberRow } from './service'

function CycleParticipation({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const canManage = usePermission('member_cycles.manage', 'group')
  const canForce = usePermission('capacity.manage')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['member-cycles', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('cycle_id, status_id').eq('member_id', memberId)
      if (error) throw error
      return data as { cycle_id: string; status_id: string }[]
    },
  })

  const change = useMutation({
    mutationFn: (v: { cycle: string; status: string; force?: boolean }) => setMemberCycleStatus({ member: memberId, ...v }),
    onSuccess: () => {
      toast.success('Status atualizado.')
      qc.invalidateQueries({ queryKey: ['member-cycles', orgId, memberId] })
      qc.invalidateQueries({ queryKey: ['capacity', orgId] })
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (canForce && /lotado/i.test(msg) && !v.force) {
        toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => change.mutate({ ...v, force: true }) } })
      } else toast.error(msg)
    },
  })

  return (
    <section className="space-y-2">
      <h3>Participação nos ciclos</h3>
      {isLoading && <Skeleton className="h-16" />}
      {cycles?.filter((c) => c.is_active).map((c) => {
        const current = statuses?.find((s) => s.id === rows?.find((r) => r.cycle_id === c.id)?.status_id)
        return (
          <Card key={c.id} className="flex items-center justify-between gap-2 p-3">
            <p className="font-semibold">{c.name}</p>
            <Select
              className="w-40"
              disabled={!canManage || change.isPending}
              value={current?.key ?? ''}
              onChange={(e) => change.mutate({ cycle: c.id, status: e.target.value })}
              aria-label={`Status em ${c.name}`}
            >
              {!current && <option value="">Sem registro</option>}
              {statuses?.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
            </Select>
          </Card>
        )
      })}
    </section>
  )
}

interface LinkRow {
  id: string
  is_primary: boolean
  ended_at: string | null
  started_at: string
  areas: { name: string } | null
  sections: { name: string } | null
  instruments: { name: string } | null
  artistic_functions: { name: string } | null
  skill_levels: { name: string } | null
}

function ArtisticLinks({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('members.manage')
  const areas = useCatalog('areas')
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const levels = useCatalog('skill_levels')
  const [f, setF] = useState({ area_id: '', section_id: '', instrument_id: '', function_id: '', skill_level_id: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  const { data } = useQuery({
    queryKey: ['member-links', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_artistic_links')
        .select('id, is_primary, started_at, ended_at, areas(name), sections(name), instruments(name), artistic_functions(name), skill_levels(name)')
        .eq('member_id', memberId)
        .is('ended_at', null)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as LinkRow[]
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['member-links', orgId, memberId] })
    qc.invalidateQueries({ queryKey: ['capacity', orgId] })
  }
  const nn = (v: string) => v || null
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('member_artistic_links').insert({
        organization_id: orgId, member_id: memberId, area_id: f.area_id,
        section_id: nn(f.section_id), instrument_id: nn(f.instrument_id), function_id: nn(f.function_id), skill_level_id: nn(f.skill_level_id),
        is_primary: (data?.length ?? 0) === 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Vínculo adicionado.')
      setF({ area_id: '', section_id: '', instrument_id: '', function_id: '', skill_level_id: '' })
      refresh()
    },
    onError: (e) => toast.error(/check|violat/i.test(String(e)) ? 'Escolha ao menos naipe, instrumento ou função.' : friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('member_artistic_links').update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })

  const opts = (items?: { id: string; name: string; is_active: boolean; area_id?: string | null; section_id?: string | null }[], areaFilter?: string) =>
    items?.filter((i) => i.is_active && (!areaFilter || !i.area_id || i.area_id === areaFilter))
      .map((i) => <option key={i.id} value={i.id}>{i.name}</option>)

  return (
    <section className="space-y-2">
      <h3>Participação artística</h3>
      {data?.length === 0 && <p className="text-muted-foreground">Nenhum vínculo ainda.</p>}
      {data?.map((l) => (
        <Card key={l.id} className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {[l.sections?.name, l.instruments?.name !== l.sections?.name ? l.instruments?.name : null, l.artistic_functions?.name].filter(Boolean).join(' · ')}
            </p>
            <p className="text-muted-foreground">{l.areas?.name}{l.skill_levels ? ` · ${l.skill_levels.name}` : ''} · desde {formatDate(l.started_at)}</p>
          </div>
          {canManage && <Button size="sm" variant="outline" onClick={() => end.mutate(l.id)}>Encerrar</Button>}
        </Card>
      ))}
      {canManage && (
        <Card className="space-y-2 p-3">
          <Select value={f.area_id} onChange={set('area_id')} aria-label="Área"><option value="">Área…</option>{opts(areas.data)}</Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.section_id} onChange={set('section_id')} aria-label="Naipe"><option value="">Naipe</option>{opts(sections.data, f.area_id)}</Select>
            <Select value={f.instrument_id} onChange={set('instrument_id')} aria-label="Instrumento"><option value="">Instrumento</option>{opts(instruments.data, f.area_id)}</Select>
            <Select value={f.function_id} onChange={set('function_id')} aria-label="Função"><option value="">Função</option>{opts(functions.data, f.area_id)}</Select>
            <Select value={f.skill_level_id} onChange={set('skill_level_id')} aria-label="Nível"><option value="">Nível</option>{opts(levels.data)}</Select>
          </div>
          <Button size="sm" disabled={!f.area_id || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar vínculo</Button>
        </Card>
      )}
    </section>
  )
}

export function MemberDetailSheet({ member }: { member: MemberRow }) {
  return (
    <SheetContent title={member.display_name ?? member.full_name} description={member.display_name ? member.full_name : (member.email ?? '')}>
      <CycleParticipation memberId={member.id} />
      <ArtisticLinks memberId={member.id} />
    </SheetContent>
  )
}
