import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { adultBirthDateMax } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { Can } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { listCatalog } from '@/modules/structure/service'
import { MemberDetailSheet } from './MemberDetailSheet'
import { createInvite, createMember, type MemberRow } from './service'

function NewMemberSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [form, setForm] = useState({ full_name: '', display_name: '', email: '', phone: '', social: '', birth_date: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const create = useMutation({
    mutationFn: () => createMember(orgId, form),
    onSuccess: () => {
      toast.success('Integrante cadastrado.')
      qc.invalidateQueries({ queryKey: ['members', orgId] })
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Novo integrante" description="Dados sensíveis são preenchidos depois, na ficha do integrante.">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="full_name">Nome completo</Label><Input id="full_name" required value={form.full_name} onChange={set('full_name')} /></div>
        <div className="space-y-1.5"><Label htmlFor="display_name">Como prefere ser chamado</Label><Input id="display_name" value={form.display_name} onChange={set('display_name')} /></div>
        <div className="space-y-1.5"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={form.email} onChange={set('email')} /></div>
        <div className="space-y-1.5"><Label htmlFor="phone">Celular</Label><PhoneInput id="phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="social">Rede social</Label><Input id="social" placeholder="@usuario" value={form.social} onChange={set('social')} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="birth_date">Data de nascimento</Label>
          <DateInput id="birth_date" max={adultBirthDateMax()} maxMessage="Apenas maiores de 18 anos podem ser integrantes." value={form.birth_date} onChange={(v) => setForm({ ...form, birth_date: v })} />
          <p className="text-xs text-muted-foreground">Apenas maiores de 18 anos podem ser integrantes.</p>
        </div>
        <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? 'Salvando…' : 'Cadastrar'}</Button>
      </form>
    </SheetContent>
  )
}

function InviteButton({ member }: { member: MemberRow }) {
  const invite = useMutation({
    mutationFn: () => createInvite(member.id),
    onSuccess: async (token) => {
      const link = `${window.location.origin}/convite/${token}`
      try {
        await navigator.clipboard.writeText(link)
        toast.success('Link de convite copiado. Válido por 7 dias.')
      } catch {
        toast.message('Link de convite', { description: link })
      }
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (member.user_id) return <Badge className="bg-success/15 text-success">Conta vinculada</Badge>
  return (
    <Button size="sm" variant="outline" disabled={invite.isPending} onClick={() => invite.mutate()}>
      <Link2 className="h-4 w-4" /> Convidar
    </Button>
  )
}

interface GroupMember extends MemberRow {
  member_artistic_links: { instrument_id: string | null; function_id: string | null; ended_at: string | null }[]
}
interface Leaf { key: string; label: string; members: GroupMember[] }

/** Integrantes agrupados por naipe → subnaipe → instrumento (grupos fechados por padrão), com filtro em funil. */
export function MembersPage() {
  const orgId = useOrgId()
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [sectionFilter, setSectionFilter] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<MemberRow | null>(null)
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const currentCycle = cycles?.find((c) => c.is_current)?.id

  const members = useQuery({
    queryKey: ['members', orgId, 'grouped'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, email, phone, social_handle, user_id, archived_at, member_artistic_links(instrument_id, function_id, ended_at)')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as GroupMember[]
    },
  })
  const cycleRows = useQuery({
    queryKey: ['members', orgId, 'cycle-status', currentCycle],
    enabled: !!currentCycle,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('member_id, status_id').eq('cycle_id', currentCycle!).limit(5000)
      if (error) throw error
      return (data ?? []) as { member_id: string; status_id: string }[]
    },
  })
  const sections = useQuery({ queryKey: ['catalog', 'sections', orgId], queryFn: () => listCatalog('sections', orgId) })
  const subsections = useQuery({ queryKey: ['catalog', 'subsections', orgId], queryFn: () => listCatalog('subsections', orgId) })
  const instruments = useQuery({ queryKey: ['catalog', 'instruments', orgId], queryFn: () => listCatalog('instruments', orgId) })
  const functions = useQuery({ queryKey: ['catalog', 'artistic_functions', orgId], queryFn: () => listCatalog('artistic_functions', orgId) })

  const statusOf = useMemo(() => {
    const byStatus = new Map((statuses ?? []).map((s) => [s.id, s]))
    return new Map((cycleRows.data ?? []).map((r) => [r.member_id, byStatus.get(r.status_id)]))
  }, [statuses, cycleRows.data])

  const tree = useMemo(() => {
    const secs = sections.data ?? []
    const subById = new Map((subsections.data ?? []).map((s) => [s.id, s]))
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const fnById = new Map((functions.data ?? []).map((f) => [f.id, f]))
    const searching = filter.search.trim() !== ''
    // seção → subnaipe (ou '') → folha (instrumento ou função)
    const map = new Map<string, Map<string, Map<string, Leaf>>>()
    const seen = new Set<string>()
    const add = (secId: string, subId: string, leafKey: string, label: string, m: GroupMember) => {
      const subs = map.get(secId) ?? new Map<string, Map<string, Leaf>>()
      const leaves = subs.get(subId) ?? new Map<string, Leaf>()
      const leaf = leaves.get(leafKey) ?? { key: leafKey, label, members: [] }
      if (!leaf.members.includes(m)) leaf.members.push(m)
      leaves.set(leafKey, leaf); subs.set(subId, leaves); map.set(secId, subs)
    }
    for (const m of members.data ?? []) {
      const st = statusOf.get(m.id)
      if (!matchesStatus(!!st?.counts_as_active, filter.status)) continue
      if (!matchesText(`${m.full_name} ${m.display_name ?? ''} ${m.email ?? ''}`, filter.search)) continue
      let placed = false
      for (const l of m.member_artistic_links.filter((x) => !x.ended_at)) {
        const inst = l.instrument_id ? instById.get(l.instrument_id) : undefined
        const fn = l.function_id ? fnById.get(l.function_id) : undefined
        if (inst?.section_id) {
          const sub = inst.subsection_id && subById.has(inst.subsection_id) ? inst.subsection_id : ''
          add(inst.section_id, sub, inst.id, inst.name, m); placed = true
        } else if (fn?.section_id) {
          add(fn.section_id, '', `fn:${fn.id}`, fn.name, m); placed = true
        }
      }
      if (!placed) add('none', '', 'none', 'Sem instrumento', m)
      seen.add(m.id)
    }
    const none = { id: 'none', name: 'Sem naipe definido', sort_order: 9999, is_active: true }
    const sectionList = [...secs, none].filter((s) => map.has(s.id) && (!sectionFilter || s.id === sectionFilter))
    return { searching, sectionList, map, subById, total: seen.size }
  }, [members.data, sections.data, subsections.data, instruments.data, functions.data, statusOf, filter, sectionFilter])

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const forceOpen = tree.searching || sectionFilter !== ''
  const isOpen = (k: string) => forceOpen || !!open[k]
  const loading = members.isLoading || sections.isLoading || instruments.isLoading

  const memberRow = (m: GroupMember) => {
    const st = statusOf.get(m.id)
    return (
      <Card key={m.id} className="flex items-center justify-between gap-3 p-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(m)}>
          <p className="truncate font-semibold">{m.display_name ?? m.full_name} {st && !st.counts_as_active && <Badge>{st.name}</Badge>}{!st && <Badge>Sem ciclo</Badge>}</p>
          <p className="truncate text-muted-foreground">{m.display_name ? `${m.full_name} · ` : ''}{m.email ?? 'sem e-mail'}</p>
        </button>
        <Can permission="members.manage"><InviteButton member={m} /></Can>
      </Card>
    )
  }

  const renderLeaves = (leaves: Map<string, Leaf>, prefix: string) =>
    [...leaves.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).map((leaf) => (
      <Collapsible key={prefix + leaf.key} level={1} title={leaf.label} count={leaf.members.length} open={isOpen(prefix + leaf.key)} onToggle={() => toggle(prefix + leaf.key)}>
        {leaf.members.map(memberRow)}
      </Collapsible>
    ))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Integrantes</h1>
        <Can permission="members.manage">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> Novo integrante</Button>
            <NewMemberSheet onClose={() => setSheetOpen(false)} />
          </Sheet>
        </Can>
      </div>

      <FilterBar value={filter} onChange={setFilter} extraCount={sectionFilter ? 1 : 0} onClearExtra={() => setSectionFilter('')}>
        <Select aria-label="Naipe" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
          <option value="">Todos os naipes</option>
          {(sections.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </FilterBar>

      {members.isError && <Card className="p-4 text-destructive">{friendlyError(members.error)}</Card>}
      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}

      {tree.sectionList.map((sec) => {
        const subs = tree.map.get(sec.id)!
        const count = new Set([...subs.values()].flatMap((l) => [...l.values()].flatMap((x) => x.members.map((m) => m.id)))).size
        const hasSubs = [...subs.keys()].some((k) => k !== '')
        const subKeys = [...subs.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (tree.subById.get(a)?.sort_order ?? 0) - (tree.subById.get(b)?.sort_order ?? 0)))
        return (
          <Collapsible key={sec.id} title={sec.name} count={count} open={isOpen(sec.id)} onToggle={() => toggle(sec.id)}>
            {subKeys.map((sk) => {
              const leaves = subs.get(sk)!
              if (!hasSubs) return <div key={sk} className="space-y-2">{renderLeaves(leaves, `${sec.id}:`)}</div>
              const subCount = new Set([...leaves.values()].flatMap((x) => x.members.map((m) => m.id))).size
              const subName = sk === '' ? 'Sem subnaipe' : tree.subById.get(sk)?.name ?? 'Subnaipe'
              const k = `${sec.id}:sub:${sk}`
              return (
                <Collapsible key={k} level={1} title={subName} count={subCount} open={isOpen(k)} onToggle={() => toggle(k)}>
                  {renderLeaves(leaves, `${k}:`)}
                </Collapsible>
              )
            })}
          </Collapsible>
        )
      })}
      {!loading && tree.sectionList.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum integrante encontrado.</Card>}

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <MemberDetailSheet member={selected} />}
      </Sheet>

      <p className="text-muted-foreground">{tree.total} {tree.total === 1 ? 'integrante' : 'integrantes'}</p>
    </div>
  )
}
