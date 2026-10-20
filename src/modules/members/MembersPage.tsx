import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Collapsible, TONES, type Tone } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, FilterBar, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { adultBirthDateMax } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { Can } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { MemberDetailSheet } from './MemberDetailSheet'
import { ReactivationRequests } from './Reactivation'
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
  member_artistic_links: { instrument_id: string | null; function_id: string | null; started_at: string; ended_at: string | null }[]
}
interface Leaf { key: string; label: string; members: GroupMember[] }
interface TreeData { sectionList: { id: string; name: string; sort_order: number; is_active: boolean }[]; map: Map<string, Map<string, Map<string, Leaf>>>; total: number }

/**
 * Integrantes agrupados por naipe → subnaipe → instrumento, VISTOS POR CICLO: os botões de ciclo mostram quem participou de cada
 * Carnaval (com o instrumento que tinha na época); "Também esteve em" cruza ciclos (ex.: ativos hoje que já estavam em 2024/25).
 */
export function MembersPage({ lockedCategory, title = 'Integrantes' }: { lockedCategory?: string; title?: string } = {}) {
  const orgId = useOrgId()
  const [categoryFilter, setCategoryFilter] = useState('')
  const cats = useQuery({
    queryKey: ['members', orgId, 'categories'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_member_categories', { p_org: orgId })
      if (error) throw error
      return (data ?? []) as { member_id: string; category_id: string; category_name: string }[]
    },
  })
  const categoryOf = new Map((cats.data ?? []).map((c) => [c.member_id, c]))
  const categoryNames = [...new Set((cats.data ?? []).map((c) => c.category_name))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const wantedCategory = lockedCategory ?? categoryFilter
  // Por padrão a lista mostra só quem está ATIVO no ciclo escolhido; "Ativos e inativos" no funil mostra todos (inativos esmaecidos).
  const [filter, setFilter] = useState<FilterValue>({ ...EMPTY_FILTER, status: 'active' })
  const [sectionFilter, setSectionFilter] = useState('')
  const [cycleSel, setCycleSel] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<MemberRow | null>(null)
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()

  // Só ciclos com gente (o Junino vazio não vira botão). Mais recente primeiro.
  const allRows = useQuery({
    queryKey: ['members', orgId, 'cycle-rows'],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('member_id, cycle_id, status_id').limit(20000)
      if (error) throw error
      return (data ?? []) as { member_id: string; cycle_id: string; status_id: string }[]
    },
  })
  const cycleButtons = useMemo(() => {
    const withPeople = new Set((allRows.data ?? []).map((r) => r.cycle_id))
    return (cycles ?? []).filter((c) => c.is_active).map((c) => ({ ...c, empty: !withPeople.has(c.id) && !c.is_current })).sort((a, b) => b.starts_on.localeCompare(a.starts_on))
  }, [cycles, allRows.data])
  const currentCycle = cycles?.find((c) => c.is_current)
  const activeCycleId = cycleSel || currentCycle?.id || cycleButtons[0]?.id || ''
  const activeCycle = cycles?.find((c) => c.id === activeCycleId)

  const members = useQuery({
    queryKey: ['members', orgId, 'grouped'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, email, phone, social_handle, user_id, archived_at, member_artistic_links(instrument_id, function_id, started_at, ended_at)')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as GroupMember[]
    },
  })
  const sections = useCatalog('sections')
  const subsections = useCatalog('subsections')
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')

  const statusByCycle = useMemo(() => {
    const byStatus = new Map((statuses ?? []).map((s) => [s.id, s]))
    const out = new Map<string, Map<string, (typeof statuses extends (infer T)[] | undefined ? T : never) | undefined>>()
    for (const r of allRows.data ?? []) {
      const m = out.get(r.cycle_id) ?? new Map()
      m.set(r.member_id, byStatus.get(r.status_id))
      out.set(r.cycle_id, m)
    }
    return out
  }, [statuses, allRows.data])
  const statusOf = (memberId: string) => statusByCycle.get(activeCycleId)?.get(memberId)
  const inCycle = (memberId: string, cycleId: string) => !!statusByCycle.get(cycleId)?.has(memberId)

  const tree = useMemo(() => {
    const secs = sections.data ?? []
    const subById = new Map((subsections.data ?? []).map((s) => [s.id, s]))
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const fnById = new Map((functions.data ?? []).map((f) => [f.id, f]))
    const searching = filter.search.trim() !== ''
    const map = new Map<string, Map<string, Map<string, Leaf>>>()
    const seen = new Set<string>()
    const add = (secId: string, subId: string, leafKey: string, label: string, m: GroupMember) => {
      const subs = map.get(secId) ?? new Map<string, Map<string, Leaf>>()
      const leaves = subs.get(subId) ?? new Map<string, Leaf>()
      const leaf = leaves.get(leafKey) ?? { key: leafKey, label, members: [] }
      if (!leaf.members.includes(m)) leaf.members.push(m)
      leaves.set(leafKey, leaf); subs.set(subId, leaves); map.set(secId, subs)
    }
    const isCurrent = !!activeCycle?.is_current
    for (const m of members.data ?? []) {
      if (!inCycle(m.id, activeCycleId)) continue
      const st = statusOf(m.id)
      if (filter.status === 'active' && !st?.counts_as_active) continue
      if (filter.status === 'inactive' && (st?.counts_as_active || st?.is_waitlist)) continue
      if (wantedCategory && categoryOf.get(m.id)?.category_name !== wantedCategory) continue
      if (!matchesText(`${m.full_name} ${m.display_name ?? ''} ${m.email ?? ''}`, filter.search)) continue
      // Instrumento NAQUELE ciclo: vínculo vigente no período; sem ele, o mais recente.
      const mine = m.member_artistic_links
      const inWindow = isCurrent ? mine.filter((x) => !x.ended_at)
        : mine.filter((x) => x.started_at <= (activeCycle?.ends_on ?? '9999') && (!x.ended_at || x.ended_at >= (activeCycle?.starts_on ?? '0000')))
      const links = inWindow.length ? inWindow : [...mine].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 1)
      let placed = false
      for (const l of links) {
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
    return { searching, subById, data: { sectionList, map, total: seen.size } as TreeData }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.data, sections.data, subsections.data, instruments.data, functions.data, statusByCycle, activeCycleId, filter, sectionFilter, wantedCategory, cats.data])
  const total = tree.data.total

  const toggle = (k: string, current: boolean) => setOpen((o) => ({ ...o, [k]: !current }))
  const forceOpen = tree.searching || sectionFilter !== ''
  // auto: grupo que é filho único do pai abre sozinho (evita clique redundante), mas o usuário ainda pode fechá-lo.
  const isOpen = (k: string, auto = false) => forceOpen || (open[k] ?? auto)
  const loading = members.isLoading || sections.isLoading || instruments.isLoading || allRows.isLoading

  const memberRow = (m: GroupMember) => {
    const st = statusOf(m.id)
    const dim = !st?.counts_as_active && !st?.is_waitlist
    return (
      <div key={m.id} className={cn('flex items-center justify-between gap-2 rounded-md px-3 py-2', dim ? 'bg-muted/60 text-muted-foreground opacity-75' : 'bg-card')}>
        <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(m)}>
          <p className={cn('truncate font-semibold', dim && 'font-medium')}>{m.display_name ?? m.full_name} {st && !st.counts_as_active && <Badge>{st.name}</Badge>}{!lockedCategory && categoryOf.get(m.id) && <Badge className="bg-muted">{categoryOf.get(m.id)!.category_name}</Badge>}</p>
          <p className="truncate text-muted-foreground">{m.display_name ? `${m.full_name} · ` : ''}{m.email ?? 'sem e-mail'}</p>
        </button>
        <Button size="icon" variant="ghost" aria-label={`Editar ficha de ${m.display_name ?? m.full_name}`} onClick={() => setSelected(m)}><Pencil className="h-4 w-4" /></Button>
        <Can permission="members.manage"><InviteButton member={m} /></Can>
      </div>
    )
  }

  const renderSections = (t: TreeData) => t.sectionList.map((sec, idx) => {
    const tone: Tone = TONES[idx % TONES.length]
    const subs = t.map.get(sec.id)!
    const count = new Set([...subs.values()].flatMap((l) => [...l.values()].flatMap((x) => x.members.map((m) => m.id)))).size
    const hasSubs = [...subs.keys()].some((k) => k !== '')
    const subKeys = [...subs.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (tree.subById.get(a)?.sort_order ?? 0) - (tree.subById.get(b)?.sort_order ?? 0)))
    const renderLeaves = (leaves: Map<string, Leaf>, p: string) =>
      [...leaves.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).map((leaf) => (
        <Collapsible key={p + leaf.key} level={1} tone={tone} title={leaf.label} count={leaf.members.length} open={isOpen(p + leaf.key, leaves.size === 1)} onToggle={() => toggle(p + leaf.key, isOpen(p + leaf.key, leaves.size === 1))}>
          <ProgressiveList items={leaf.members} render={memberRow} resetKey={filter.search + activeCycleId} />
        </Collapsible>
      ))
    const sk0 = `${activeCycleId}:${sec.id}`
    return (
      <Collapsible key={sk0} tone={tone} title={sec.name} count={count} open={isOpen(sk0)} onToggle={() => toggle(sk0, isOpen(sk0))}>
        {subKeys.map((sk) => {
          const leaves = subs.get(sk)!
          // Subnaipe é opcional: quem não tem fica direto no naipe, sem grupo "Sem subnaipe".
          if (!hasSubs || sk === '') return <div key={sk} className="space-y-2">{renderLeaves(leaves, `${sk0}:`)}</div>
          const subCount = new Set([...leaves.values()].flatMap((x) => x.members.map((m) => m.id))).size
          const subName = tree.subById.get(sk)?.name ?? 'Subnaipe'
          const k = `${sk0}:sub:${sk}`
          return (
            <Collapsible key={k} level={1} tone={tone} title={subName} count={subCount} open={isOpen(k, subKeys.length === 1)} onToggle={() => toggle(k, isOpen(k, subKeys.length === 1))}>
              {renderLeaves(leaves, `${k}:`)}
            </Collapsible>
          )
        })}
      </Collapsible>
    )
  })

  const chip = (on: boolean) => cn('rounded-full border px-3 py-1.5 text-sm font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{title}</h1>
        <Can permission="members.manage">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> Novo integrante</Button>
            <NewMemberSheet onClose={() => setSheetOpen(false)} />
          </Sheet>
        </Can>
      </div>

      {cycleButtons.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ciclo">
          {cycleButtons.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === activeCycleId} disabled={c.empty} title={c.empty ? 'Ainda não houve oficina neste ciclo' : undefined}
              className={cn(chip(c.id === activeCycleId), c.empty && 'cursor-not-allowed opacity-40 hover:bg-card')}
              onClick={() => setCycleSel(c.id)}>
              {c.name}{c.is_current ? ' · atual' : ''}
            </button>
          ))}
        </div>
      )}

      <FilterBar value={filter} onChange={setFilter} extraCount={(sectionFilter ? 1 : 0) + (categoryFilter && !lockedCategory ? 1 : 0)} onClearExtra={() => { setSectionFilter(''); setCategoryFilter('') }}>
        <Select aria-label="Naipe" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
          <option value="">Todos os naipes</option>
          {(sections.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {!lockedCategory && categoryNames.length > 0 && (
          <Select aria-label="Categoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categoryNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        )}
      </FilterBar>

      <ReactivationRequests />
      {members.isError && <Card className="p-4 text-destructive">{friendlyError(members.error)}</Card>}
      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}

      {renderSections(tree.data)}
      {!loading && total === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum integrante encontrado neste ciclo com esses filtros.</Card>}

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <MemberDetailSheet member={selected} />}
      </Sheet>

      <p className="text-muted-foreground">
        {total} {total === 1 ? 'integrante' : 'integrantes'} em {activeCycle?.name ?? 'ciclo'}
      </p>
    </div>
  )
}
