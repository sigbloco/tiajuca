import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AutoComplete, Chip } from '@/components/shared/AutoComplete'
import { DateInput } from '@/components/ui/masked-inputs'
import { Button, Card, Label, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface LinkRow {
  id: string
  started_at: string
  instrument_id: string | null
  function_id: string | null
  skill_level_id: string | null
  instruments: { name: string; section_id: string; sections: { name: string } | null } | null
  artistic_functions: { name: string } | null
  skill_levels: { name: string } | null
}
interface Draft { section_id: string; instrument_id: string; function_id: string; skill_level_id: string; started_at: string }
const EMPTY: Draft = { section_id: '', instrument_id: '', function_id: '', skill_level_id: '', started_at: '' }

/** Vínculos artísticos do integrante: naipe → instrumento (subnaipe nunca aparece aqui) e/ou função. Editáveis. */
export function ArtisticLinks({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('members.manage')
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const levels = useCatalog('skill_levels')
  // null = fechado · 'new' = novo vínculo · id = editando aquele vínculo
  const [editing, setEditing] = useState<string | null>(null)
  const [f, setF] = useState<Draft>(EMPTY)

  const { data } = useQuery({
    queryKey: ['member-links', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_artistic_links')
        .select('id, started_at, instrument_id, function_id, skill_level_id, instruments(name, section_id, sections(name)), artistic_functions(name), skill_levels(name)')
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
    qc.invalidateQueries({ queryKey: ['members', orgId] })
  }
  const nn = (v: string) => v || null
  const close = () => { setEditing(null); setF(EMPTY) }

  const save = useMutation({
    mutationFn: async () => {
      const started = f.started_at || null
      const row = { instrument_id: nn(f.instrument_id), function_id: nn(f.function_id), skill_level_id: nn(f.skill_level_id) }
      if (editing === 'new') {
        const { data: ins, error } = await supabase.from('member_artistic_links').insert({
          organization_id: orgId, member_id: memberId, ...row, ...(started ? { started_at: started } : {}), is_primary: (data?.length ?? 0) === 0,
        }).select('id').single()
        if (error) throw error
        return { kind: 'new' as const, id: (ins as { id: string }).id, prev: null }
      }
      const old = data?.find((l) => l.id === editing)
      const prev = old ? { instrument_id: old.instrument_id, function_id: old.function_id, skill_level_id: old.skill_level_id, started_at: old.started_at } : null
      const { error } = await supabase.from('member_artistic_links').update({ ...row, ...(started ? { started_at: started } : {}) }).eq('id', editing!)
      if (error) throw error
      return { kind: 'edit' as const, id: editing, prev }
    },
    onSuccess: (r) => {
      close(); refresh()
      notifyChange(r.kind === 'new' ? 'Vínculo adicionado.' : 'Vínculo atualizado.', async () => {
        const { error } = r.kind === 'new'
          ? await supabase.from('member_artistic_links').update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', r.id!)
          : await supabase.from('member_artistic_links').update(r.prev!).eq('id', r.id!)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(/check|violat/i.test(String(e)) ? 'Escolha um instrumento ou uma função.' : friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('member_artistic_links').update({ ended_at: new Date().toISOString().slice(0, 10) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      refresh()
      notifyChange('Vínculo encerrado.', async () => {
        const { error } = await supabase.from('member_artistic_links').update({ ended_at: null }).eq('id', id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const active = <T extends { is_active: boolean }>(items?: T[]) => items?.filter((i) => i.is_active) ?? []
  const instrumentLabel = (id: string) => {
    const i = instruments.data?.find((x) => x.id === id)
    return i ? `${i.name} · ${sections.data?.find((s) => s.id === i.section_id)?.name ?? ''}` : '…'
  }
  const startEdit = (l: LinkRow) => {
    setEditing(l.id)
    setF({
      section_id: l.instruments?.section_id ?? '', instrument_id: l.instrument_id ?? '', function_id: l.function_id ?? '',
      skill_level_id: l.skill_level_id ?? '', started_at: l.started_at,
    })
  }

  const form = (
    <Card className="space-y-2 p-3">
      <div className="space-y-1.5">
        <Label>Instrumento</Label>
        {f.instrument_id ? (
          <div><Chip label={instrumentLabel(f.instrument_id)} onRemove={() => setF({ ...f, instrument_id: '', section_id: '' })} removeLabel="Trocar instrumento" /></div>
        ) : (
          <AutoComplete aria-label="Instrumento" placeholder="Escreva o instrumento (ex.: Surdo)…"
            options={active(instruments.data).map((i) => ({ id: i.id, label: i.name, hint: sections.data?.find((s) => s.id === i.section_id)?.name }))}
            onPick={(o) => setF({ ...f, instrument_id: o.id, section_id: instruments.data?.find((i) => i.id === o.id)?.section_id ?? '' })} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={f.function_id} aria-label="Função" onChange={(e) => setF({ ...f, function_id: e.target.value })}>
          <option value="">Função (opcional)</option>
          {active(functions.data).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Select value={f.skill_level_id} aria-label="Nível" onChange={(e) => setF({ ...f, skill_level_id: e.target.value })}>
          <option value="">Nível (opcional)</option>
          {active(levels.data).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="al-since">Desde</Label>
        <DateInput id="al-since" value={f.started_at} onChange={(v) => setF({ ...f, started_at: v })} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={(!f.instrument_id && !f.function_id) || save.isPending} onClick={() => save.mutate()}>
          {editing === 'new' ? 'Adicionar' : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>Cancelar</Button>
      </div>
    </Card>
  )

  return (
    <section className="space-y-2">
      <h3>Participação artística</h3>
      {data?.length === 0 && <p className="text-muted-foreground">Nenhum vínculo ainda.</p>}
      {data?.map((l) => (editing === l.id ? <div key={l.id}>{form}</div> : (
        <Card key={l.id} className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {[l.instruments?.name, l.artistic_functions?.name].filter(Boolean).join(' · ')}
            </p>
            <p className="text-muted-foreground">
              {[l.instruments?.sections?.name, l.skill_levels?.name].filter(Boolean).join(' · ')} · desde {formatDate(l.started_at)}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" aria-label="Editar vínculo" onClick={() => startEdit(l)}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => end.mutate(l.id)}>Encerrar</Button>
            </div>
          )}
        </Card>
      )))}
      {canManage && editing === 'new' && form}
      {canManage && editing === null && (
        <Button size="sm" variant="outline" onClick={() => { setF(EMPTY); setEditing('new') }}>
          <Plus className="h-4 w-4" /> Adicionar vínculo
        </Button>
      )}
    </section>
  )
}
