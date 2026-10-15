import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface LinkRow {
  id: string
  started_at: string
  instruments: { name: string; sections: { name: string } | null } | null
  artistic_functions: { name: string } | null
  skill_levels: { name: string } | null
}

/** Vínculos artísticos do integrante: naipe → instrumento (subnaipe nunca aparece aqui) e/ou função. */
export function ArtisticLinks({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('members.manage')
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const levels = useCatalog('skill_levels')
  const [f, setF] = useState({ section_id: '', instrument_id: '', function_id: '', skill_level_id: '' })

  const { data } = useQuery({
    queryKey: ['member-links', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_artistic_links')
        .select('id, started_at, instruments(name, sections(name)), artistic_functions(name), skill_levels(name)')
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
        organization_id: orgId, member_id: memberId,
        instrument_id: nn(f.instrument_id), function_id: nn(f.function_id), skill_level_id: nn(f.skill_level_id),
        is_primary: (data?.length ?? 0) === 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Vínculo adicionado.')
      setF({ section_id: '', instrument_id: '', function_id: '', skill_level_id: '' })
      refresh()
    },
    onError: (e) => toast.error(/check|violat/i.test(String(e)) ? 'Escolha um instrumento ou uma função.' : friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('member_artistic_links').update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })

  const active = <T extends { is_active: boolean }>(items?: T[]) => items?.filter((i) => i.is_active) ?? []

  return (
    <section className="space-y-2">
      <h3>Participação artística</h3>
      {data?.length === 0 && <p className="text-muted-foreground">Nenhum vínculo ainda.</p>}
      {data?.map((l) => (
        <Card key={l.id} className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {[l.instruments?.name, l.artistic_functions?.name].filter(Boolean).join(' · ')}
            </p>
            <p className="text-muted-foreground">
              {[l.instruments?.sections?.name, l.skill_levels?.name].filter(Boolean).join(' · ')} · desde {formatDate(l.started_at)}
            </p>
          </div>
          {canManage && <Button size="sm" variant="outline" onClick={() => end.mutate(l.id)}>Encerrar</Button>}
        </Card>
      ))}
      {canManage && (
        <Card className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.section_id} aria-label="Naipe" onChange={(e) => setF({ ...f, section_id: e.target.value, instrument_id: '' })}>
              <option value="">Naipe…</option>
              {active(sections.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={f.instrument_id} aria-label="Instrumento" disabled={!f.section_id} onChange={(e) => setF({ ...f, instrument_id: e.target.value })}>
              <option value="">Instrumento…</option>
              {active(instruments.data).filter((i) => i.section_id === f.section_id).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
            <Select value={f.function_id} aria-label="Função" onChange={(e) => setF({ ...f, function_id: e.target.value })}>
              <option value="">Função (opcional)</option>
              {active(functions.data).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
            <Select value={f.skill_level_id} aria-label="Nível" onChange={(e) => setF({ ...f, skill_level_id: e.target.value })}>
              <option value="">Nível (opcional)</option>
              {active(levels.data).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </div>
          <Button size="sm" disabled={(!f.instrument_id && !f.function_id) || add.isPending} onClick={() => add.mutate()}>
            <Plus className="h-4 w-4" /> Adicionar vínculo
          </Button>
        </Card>
      )}
    </section>
  )
}
