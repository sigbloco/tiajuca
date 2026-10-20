import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/shared/AutoComplete'
import { Button, Card, Input, Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { shortName } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, saveCatalogItem } from './service'
import { nextOrder } from './StructureManagers'

type Staff = { professors: string[]; monitors: string[] }
const EMPTY_STAFF: Staff = { professors: [], monitors: [] }
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
              <MemberPicker value="" onChange={(id) => { if (id && !value[k].includes(id)) onChange({ ...value, [k]: [...value[k], id] }); setAdding(null) }} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Criar um naipe de uma vez: nome, afinação, equipe e subnaipes (cada um com sua equipe). */
export function NewSectionWizard() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [hasTuning, setHasTuning] = useState(true)
  const [staff, setStaff] = useState<Staff>(EMPTY_STAFF)
  const [withSubs, setWithSubs] = useState(false)
  const [subs, setSubs] = useState<{ name: string; staff: Staff }[]>([{ name: '', staff: EMPTY_STAFF }])

  const reset = () => { setName(''); setHasTuning(true); setStaff(EMPTY_STAFF); setWithSubs(false); setSubs([{ name: '', staff: EMPTY_STAFF }]); setOpen(false) }
  const assign = async (member: string, kind: 'professor' | 'monitor', col: 'section_id' | 'subsection_id', id: string) => {
    const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: member, staff_kind: kind, [col]: id })
    if (error) throw error
  }
  const create = useMutation({
    mutationFn: async () => {
      const secId = await saveCatalogItem('sections', orgId, { name: name.trim(), sort_order: nextOrder(sections.data ?? []), has_tuning: hasTuning })
      if (!secId) throw new Error('Não foi possível criar o naipe.')
      for (const m of staff.professors) await assign(m, 'professor', 'section_id', secId)
      for (const m of staff.monitors) await assign(m, 'monitor', 'section_id', secId)
      if (withSubs) {
        let order = nextOrder(subsections.data ?? [])
        for (const s of subs.filter((x) => x.name.trim())) {
          const subId = await saveCatalogItem('subsections', orgId, { name: s.name.trim(), section_id: secId, sort_order: order++ })
          if (!subId) continue
          for (const m of s.staff.professors) await assign(m, 'professor', 'subsection_id', subId)
          for (const m of s.staff.monitors) await assign(m, 'monitor', 'subsection_id', subId)
        }
      }
    },
    onSuccess: () => { toast.success('Naipe criado.'); invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['staff-assignments', orgId] }); reset() },
    onError: (e) => { toast.error(friendlyError(e)); invalidateCatalog(qc, orgId) },
  })

  if (!open) return <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo naipe</Button>
  return (
    <Card className="space-y-4 p-4">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
        <h2>Novo naipe</h2>
        <div className="space-y-1.5"><Label htmlFor="ns-name">Nome do naipe</Label><Input id="ns-name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={hasTuning} onChange={(e) => setHasTuning(e.target.checked)} /> Os instrumentos deste naipe têm afinação (Bb, Eb, F, C)</label>
        <div className="space-y-1.5"><p className="font-semibold">Equipe do naipe</p><StaffPick value={staff} onChange={setStaff} /></div>
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
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setSubs([...subs, { name: '', staff: EMPTY_STAFF }])}><Plus className="h-4 w-4" /> Subnaipe</Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Os instrumentos você cria depois, dentro do naipe ou de cada subnaipe.</p>
        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? 'Criando…' : 'Criar naipe'}</Button>
          <Button type="button" variant="ghost" onClick={reset}>Cancelar</Button>
        </div>
      </form>
    </Card>
  )
}
