import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
import { Button, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { shortName } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from './CatalogEditor'
import { TuningChips } from './TuningChips'
import { invalidateCatalog, saveCatalogItem } from './service'
import { nextOrder } from './StructureManagers'

type Staff = { professors: string[]; monitors: string[] }
const EMPTY_STAFF: Staff = { professors: [], monitors: [] }
type Inst = { name: string; tuning: string | null }
interface Person { id: string; full_name: string; display_name: string | null }

function usePeople() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['members', orgId, 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email').eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as Person[]
    },
  })
}

/** Escolha de professores e monitores (várias pessoas) com chips. */
function StaffPick({ value, onChange }: { value: Staff; onChange: (v: Staff) => void }) {
  const people = usePeople()
  const name = (id: string) => { const p = people.data?.find((x) => x.id === id); return p ? shortName(p.full_name, p.display_name) : '…' }
  const [adding, setAdding] = useState<keyof Staff | null>(null)
  const rows: [keyof Staff, string][] = [['professors', 'Professores'], ['monitors', 'Monitores']]
  return (
    <div className="space-y-2">
      {rows.map(([k, label]) => (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 shrink-0 text-sm font-semibold text-muted-foreground">{label}</span>
          {value[k].map((id) => <Chip key={id} label={name(id)} onRemove={() => onChange({ ...value, [k]: value[k].filter((x) => x !== id) })} removeLabel={`Tirar ${name(id)}`} />)}
          {value[k].length === 0 && <span className="text-sm text-muted-foreground">ninguém</span>}
          {adding !== k && <Button type="button" size="sm" variant="outline" onClick={() => setAdding(k)}><Plus className="h-4 w-4" /> Adicionar</Button>}
          {adding === k && (
            <div className="w-full max-w-sm">
              <MemberPicker onlyActive value="" onChange={(id) => { if (id && !value[k].includes(id)) onChange({ ...value, [k]: [...value[k], id] }); setAdding(null) }} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Instrumentos a criar junto: nome e, se tiver, a afinação (chips). */
function InstrumentsPick({ value, onChange }: { value: Inst[]; onChange: (v: Inst[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input className="min-w-40 flex-1" aria-label={`Nome do instrumento ${i + 1}`} placeholder="Nome do instrumento" value={it.name} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
          <TuningChips value={it.tuning} onChange={(v) => onChange(value.map((x, k) => (k === i ? { ...x, tuning: v } : x)))} />
          <Button type="button" size="icon" variant="ghost" aria-label="Remover instrumento" onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { name: '', tuning: null }])}><Plus className="h-4 w-4" /> Instrumento</Button>
    </div>
  )
}

/** Criar um naipe de uma vez: nome, afinação, equipe e subnaipes (cada um com sua equipe). */
export function NewSectionSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const names = useCatalog('section_names')
  const [name, setName] = useState('')
  const [insts, setInsts] = useState<Inst[]>([])
  const [staff, setStaff] = useState<Staff>(EMPTY_STAFF)
  const [withSubs, setWithSubs] = useState(false)
  const [subs, setSubs] = useState<{ name: string; staff: Staff; insts: Inst[] }[]>([{ name: '', staff: EMPTY_STAFF, insts: [] }])
  const instruments = useCatalog('instruments')

  const reset = () => onClose()
  const assign = async (member: string, kind: 'professor' | 'monitor', col: 'section_id' | 'subsection_id', id: string) => {
    const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: member, staff_kind: kind, [col]: id })
    if (error) throw error
  }
  const create = useMutation({
    mutationFn: async () => {
      const secId = await saveCatalogItem('sections', orgId, { name: name.trim(), sort_order: nextOrder(sections.data ?? []) })
      if (!secId) throw new Error('Não foi possível criar o naipe.')
      for (const m of staff.professors) await assign(m, 'professor', 'section_id', secId)
      for (const m of staff.monitors) await assign(m, 'monitor', 'section_id', secId)
      let instOrder = nextOrder(instruments.data ?? [])
      const makeInsts = async (list: Inst[], subId: string | null) => {
        for (const it of list.filter((x) => x.name.trim())) await saveCatalogItem('instruments', orgId, { name: it.name.trim(), section_id: secId, subsection_id: subId, tuning: it.tuning, sort_order: instOrder++ })
      }
      await makeInsts(insts, null)
      if (withSubs) {
        let order = nextOrder(subsections.data ?? [])
        for (const s of subs.filter((x) => x.name.trim())) {
          const subId = await saveCatalogItem('subsections', orgId, { name: s.name.trim(), section_id: secId, sort_order: order++ })
          if (!subId) continue
          for (const m of s.staff.professors) await assign(m, 'professor', 'subsection_id', subId)
          for (const m of s.staff.monitors) await assign(m, 'monitor', 'subsection_id', subId)
          await makeInsts(s.insts, subId)
        }
      }
    },
    onSuccess: () => { toast.success('Naipe criado.'); invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['staff-assignments', orgId] }); reset() },
    onError: (e) => { toast.error(friendlyError(e)); invalidateCatalog(qc, orgId) },
  })

  const taken = new Set((sections.data ?? []).filter((s) => s.is_active).map((s) => s.name.toLowerCase()))
  const available = (names.data ?? []).filter((n) => n.is_active && !taken.has(n.name.toLowerCase()))
  return (
    <SheetContent title="Novo naipe" description="Escolha o naipe e, se quiser, já cadastre equipe, subnaipes e instrumentos.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
        <div className="space-y-1.5"><Label htmlFor="ns-name">Nome do naipe</Label>
          <Select id="ns-name" required value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">Selecione…</option>
            {available.map((n) => <option key={n.id} value={n.name}>{n.name}</option>)}
          </Select>
          {available.length === 0 && <p className="text-sm text-muted-foreground">Todos os nomes já têm naipe. Cadastre mais nomes em Organização → Nomes de naipes.</p>}</div>
        <div className="space-y-1.5"><p className="font-semibold">Equipe do naipe</p><StaffPick value={staff} onChange={setStaff} /></div>
        <div className="space-y-1.5"><p className="font-semibold">Instrumentos do naipe</p><InstrumentsPick value={insts} onChange={setInsts} /></div>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={withSubs} onChange={(e) => setWithSubs(e.target.checked)} /> Este naipe tem subnaipes</label>
        {withSubs && (
          <div className="space-y-3">
            {subs.map((s, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex gap-2">
                  <Input aria-label={`Nome do subnaipe ${i + 1}`} placeholder="Nome do subnaipe" value={s.name} onChange={(e) => setSubs(subs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover subnaipe" disabled={subs.length === 1} onClick={() => setSubs(subs.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <StaffPick value={s.staff} onChange={(v) => setSubs(subs.map((x, k) => (k === i ? { ...x, staff: v } : x)))} />
                <p className="text-sm font-semibold">Instrumentos deste subnaipe</p>
                <InstrumentsPick value={s.insts} onChange={(v) => setSubs(subs.map((x, k) => (k === i ? { ...x, insts: v } : x)))} />
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setSubs([...subs, { name: '', staff: EMPTY_STAFF, insts: [] }])}><Plus className="h-4 w-4" /> Subnaipe</Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">A afinação é do instrumento (opcional). Dá para acrescentar mais instrumentos e subnaipes depois, na página Naipes.</p>
        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? 'Criando…' : 'Criar naipe'}</Button>
          <Button type="button" variant="ghost" onClick={reset}>Cancelar</Button>
        </div>
      </form>
    </SheetContent>
  )
}
