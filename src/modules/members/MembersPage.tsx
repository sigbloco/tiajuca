import { nameWithSurname } from './personLabel'
import { ParticipationRequests } from './ParticipationRequests'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { givenName, shortName } from '@/core/format'
import { Eye, Filter, Heart, Pencil, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { CameFrom } from '@/app/navigation'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { Collapsible, TONES, type Tone } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Badge, Button, Card, Input, Select, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { Can, usePermission } from '@/core/permissions'
import { MemberAvatar } from './MemberAvatar'
import { supabase } from '@/core/supabase'
import { hrefOf } from '@/modules/site/links'
import { maskPhone } from '@/components/ui/masked-inputs'
import { WhatsAppIcon } from './MemberSection'
import { isPastCycle, useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { MemberDetailSheet } from './MemberDetailSheet'
import { MemberDirectory } from './MemberDirectory'
import { ReactivationRequests } from './Reactivation'
import { type MemberRow } from './service'
import { NewMemberSheet } from './NewMemberSheet'
import { MembersTrash } from './MembersTrash'

interface GroupMember extends MemberRow {
}
interface Leaf { key: string; label: string; members: GroupMember[] }
interface TreeData { sectionList: { id: string; name: string; sort_order: number; is_active: boolean }[]; map: Map<string, Map<string, Map<string, Leaf>>>; total: number }

/**
 * Integrantes agrupados por naipe → instrumento, VISTOS POR CICLO: os botões de ciclo mostram quem participou de cada
 * Carnaval (com o instrumento que tinha na época); "Também esteve em" cruza ciclos (ex.: ativos hoje que já estavam em 2024/25).
 */
const plain = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const sameName = (a: string, b: string) => plain(a) === plain(b)
const TYPE_LABEL: Record<string, string> = { regente: 'Regente', professor: 'Professor', monitor: 'Monitor', senior: 'Sênior', musico: 'Músico', aluno: 'Aluno' }
// Ordem pensada para a quebra 3 + 2: os rótulos curtos em cima, os dois longos embaixo (mais largos, sem cortar o texto).
const TYPE_OPTIONS: [string, string][] = [['aluno', 'Alunos'], ['regente', 'Regentes'], ['senior', 'Seniores'], ['musico', 'Músicos'], ['equipe', 'Professores e Monitores']]

/**
 * Quem vê cadastros de outras pessoas (grupo ou todos: equipe e Direção) tem a lista completa, por naipe, com fichas e filtros;
 * quem só vê o próprio cadastro (integrante comum) vê a lista de nomes dos ativos (D13). O que cada um enxerga vem do banco.
 */
export function MembersPage({ lockedCategory, title = 'Integrantes' }: { lockedCategory?: string; title?: string } = {}) {
  const seesOthers = usePermission('members.read', 'group')
  if (!seesOthers && !lockedCategory) return <MemberDirectory title={title} />
  return <MembersTree lockedCategory={lockedCategory} title={title} />
}

function MembersTree({ lockedCategory, title }: { lockedCategory?: string; title: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  // Quem não gerencia (ex.: Professor/Monitor) abre a ficha só para ver: olho e "Ver ficha", não lápis.
  const canEditMembers = usePermission('members.manage')
  const wantedCategory = lockedCategory ?? ''
  // Por padrão a lista mostra só quem está ATIVO no ciclo escolhido; "Ativos e inativos" no funil mostra todos (inativos esmaecidos).
  // Filtros: busca por nome; situação no ciclo (ativos por padrão); tipos de pessoa (todos marcados por padrão).
  const [search, setSearch] = useState('')
  const filter: FilterValue = { ...EMPTY_FILTER, search }
  const sectionFilter = ''
  // Filtro por naipe e atividade (a atividade só depois do naipe) e, para professor/monitor, "Meus alunos" (o que eles atendem no ciclo atual).
  const initial = new URLSearchParams(window.location.search)
  const [naipeF, setNaipeF] = useState(() => initial.get('naipeId') ?? '')
  const [atvF, setAtvF] = useState(() => initial.get('atividadeId') ?? '')
  const [mine, setMine] = useState(() => initial.get('meus') === '1')
  const { membership } = useOrganization()
  const myStaff = useQuery({
    queryKey: ['my-staff-scope', orgId, membership?.member_id],
    enabled: Boolean(membership?.member_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('section_id, instrument_id, cycles!inner(is_current)').eq('organization_id', orgId).eq('member_id', membership!.member_id).is('valid_to', null).in('staff_kind', ['professor', 'monitor']).eq('cycles.is_current', true)
      if (error) throw error
      return (data ?? []) as unknown as { section_id: string | null; instrument_id: string | null }[]
    },
  })
  // Situação: Ativos (padrão) e Inativos acumulam; os dois marcados = todos.
  const [showActive, setShowActive] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  // "?tipo=aluno" (vindo de Oficina → Alunos) já abre com esse filtro marcado.
  const [types, setTypes] = useState<Set<string>>(() => {
    const t = new URLSearchParams(window.location.search).get('tipo')
    return new Set(t && TYPE_OPTIONS.some(([k]) => k === t) ? [t] : [])
  })
  const staffKinds = useQuery({
    queryKey: ['staff-assignments', orgId, 'kinds'],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('member_id, staff_kind, cycles!inner(is_current)').eq('organization_id', orgId).is('valid_to', null).eq('cycles.is_current', true).limit(3000)
      if (error) throw error
      const out = new Map<string, Set<string>>()
      for (const r of data ?? []) { const set = out.get(r.member_id as string) ?? new Set<string>(); set.add(r.staff_kind as string); out.set(r.member_id as string, set) }
      return out
    },
  })
  // Os tipos vêm da chave fixa da categoria, não do nome: renomear "Músico" para "Músico convidado" mantém os filtros e os chips (que passam a usar o nome novo).
  const feeCats = useCatalog('fee_categories')
  // Categorias com qualificador, como "Aluno (sopro)" e "Aluno (percussão)", são o mesmo tipo ("Aluno"): vale o nome sem o parêntese.
  const baseName = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const baseKey = (n: string) => { const w = baseName(n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()); return w === 'aluno' ? 'aluno' : w === 'senior' ? 'senior' : w.startsWith('musico') ? 'musico' : undefined }
  const keyByName = new Map((feeCats.data ?? []).filter((c) => c.base_key || c.system_key).map((c) => [c.name, (c.base_key ?? c.system_key) as string]))
  const typesOf = (memberId: string) => {
    const out = new Set<string>(staffKinds.data?.get(memberId) ?? [])
    for (const cat of allCategories(memberId)) {
      const k = keyByName.get(cat) ?? baseKey(cat)
      if (k === 'aluno' || k === 'senior' || k === 'musico' || k === 'monitor') out.add(k)
    }
    return out
  }
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const catName = (k: string) => { const n = (feeCats.data ?? []).find((c) => (c.base_key ?? c.system_key) === k)?.name; return n ? baseName(n) : n }
  /** Nome mostrado: o padrão se a categoria ainda tem o nome de fábrica; senão, o nome que a Direção deu. */
  const typeName = (k: string, fallback: string, factory: string[]) => { const n = catName(k); return n && !factory.some((f) => norm(f) === norm(n)) ? n : fallback }
  const typeBadge = (k: string) => (k === 'musico' ? typeName(k, TYPE_LABEL[k], ['Músico']) : k === 'senior' ? typeName(k, TYPE_LABEL[k], ['Senior', 'Sênior']) : k === 'aluno' ? typeName(k, TYPE_LABEL[k], ['Aluno']) : TYPE_LABEL[k] ?? k)
  const typeChip = (k: string, label: string) => (k === 'musico' || k === 'senior' || k === 'aluno' ? typeName(k, label, k === 'musico' ? ['Músico'] : k === 'senior' ? ['Senior', 'Sênior'] : ['Aluno']) : label)
  const { cycleId: globalCycleId } = useSelectedCycle()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<MemberRow | null>(null)
  const [params, setParams] = useSearchParams()
  const wantedId = params.get('m')
  useEffect(() => {
    if (!wantedId || selected?.id === wantedId) return
    void supabase.from('members').select('id, full_name, display_name, email, phone, social_handle, birth_date, user_id, archived_at').eq('id', wantedId).maybeSingle()
      .then(({ data }) => { if (data) setSelected(data as MemberRow) })
  }, [wantedId])
  const navigate = useNavigate()
  const cameFrom = (useLocation().state as { from?: CameFrom } | null)?.from
  // O "x" da ficha leva de volta à página de onde a pessoa veio (se veio de outra); senão só fecha a ficha.
  const closeSheet = () => {
    setSelected(null)
    if (wantedId && cameFrom) navigate(cameFrom.path)
    else if (wantedId) setParams({}, { replace: true })
  }
  // "Integrantes" no caminho de navegação: fica na lista de integrantes (sem voltar de onde veio).
  const stayOnList = () => {
    setSelected(null)
    if (wantedId) navigate(`${window.location.pathname}`, { replace: true, state: null })
  }
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
  const currentCycle = cycles?.find((c) => c.is_current)
  const activeCycleId = globalCycleId || currentCycle?.id || ''
  const activeCycle = cycles?.find((c) => c.id === activeCycleId)
  const pastCycle = !!activeCycle && isPastCycle(activeCycle)

  // Categoria e participação (instrumento/função) de cada pessoa NO CICLO escolhido.
  const cats = useQuery({
    queryKey: ['members', orgId, 'categories', activeCycleId],
    enabled: !!activeCycleId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_member_categories', { p_org: orgId, p_cycle: activeCycleId })
      if (error) throw error
      return (data ?? []) as { member_id: string; category_id: string; category_name: string; is_extra?: boolean }[]
    },
  })
  // Principal (define a cobrança) e todas as categorias acumuladas de cada pessoa.
  const categoryOf = new Map((cats.data ?? []).filter((c) => !c.is_extra).map((c) => [c.member_id, c]))
  const allCategories = (id: string) => (cats.data ?? []).filter((c) => c.member_id === id).map((c) => c.category_name)
  const parts = useQuery({
    queryKey: ['members', orgId, 'cycle-participations', activeCycleId],
    enabled: !!activeCycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_participations').select('member_id, instrument_id, function_id').eq('cycle_id', activeCycleId).limit(5000)
      if (error) throw error
      const out = new Map<string, { instrument_id: string | null; function_id: string | null }[]>()
      for (const x of data ?? []) { const l = out.get(x.member_id as string) ?? []; l.push({ instrument_id: x.instrument_id as string | null, function_id: x.function_id as string | null }); out.set(x.member_id as string, l) }
      return out
    },
  })

  const members = useQuery({
    queryKey: ['members', orgId, 'grouped'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('id, full_name, display_name, email, phone, social_handle, birth_date, user_id, archived_at')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as unknown as GroupMember[]
    },
  })
  const sections = useCatalog('sections')
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
    for (const m of members.data ?? []) {
      if (!inCycle(m.id, activeCycleId)) continue
      const st = statusOf(m.id)
      if (showActive !== showInactive) {
        if (showActive && !st?.counts_as_active) continue
        if (showInactive && (st?.counts_as_active || st?.is_waitlist)) continue
      }
      if (!lockedCategory && types.size > 0) {
        const mine = typesOf(m.id); if (mine.has('professor') || mine.has('monitor')) mine.add('equipe')
        if (![...types].some((t) => mine.has(t))) continue
      }
      if (wantedCategory && !allCategories(m.id).includes(wantedCategory)) continue
      if (!matchesText(`${m.full_name} ${m.display_name ?? ''} ${m.email ?? ''}`, filter.search)) continue
      // Instrumento/função NAQUELE ciclo (participação do próprio ciclo).
      const links = parts.data?.get(m.id) ?? []
      let placed = false
      const filtering = Boolean(naipeF || atvF || mine)
      const mineRules = myStaff.data ?? []
      for (const l of links) {
        const inst = l.instrument_id ? instById.get(l.instrument_id) : undefined
        const fn = l.function_id ? fnById.get(l.function_id) : undefined
        const secId = inst?.section_id ?? fn?.section_id ?? null
        if (!secId) continue
        if (naipeF && secId !== naipeF) continue
        if (atvF && inst?.id !== atvF) continue
        if (mine && !mineRules.some((a) => (a.instrument_id ? a.instrument_id === inst?.id : a.section_id === secId))) continue
        if (inst?.section_id) add(inst.section_id, '', inst.id, inst.name, m)
        else add(secId, '', `fn:${fn!.id}`, fn!.name, m)
        placed = true
      }
      if (!placed) { if (filtering) continue; add('none', '', 'none', 'Sem instrumento', m) }
      seen.add(m.id)
    }
    const none = { id: 'none', name: 'Sem naipe definido', sort_order: 9999, is_active: true }
    const sectionList = [...secs, none].filter((s) => map.has(s.id) && (!sectionFilter || s.id === sectionFilter))
    return { searching, data: { sectionList, map, total: seen.size } as TreeData }
  }, [members.data, sections.data, instruments.data, functions.data, statusByCycle, activeCycleId, filter, sectionFilter, wantedCategory, cats.data, parts.data, showActive, showInactive, types, staffKinds.data, naipeF, atvF, mine, myStaff.data])
  const total = tree.data.total

  const toggle = (k: string, current: boolean) => setOpen((o) => ({ ...o, [k]: !current }))
  const forceOpen = tree.searching || sectionFilter !== '' || Boolean(naipeF || atvF || mine)
  // auto: grupo que é filho único do pai abre sozinho (evita clique redundante), mas o usuário ainda pode fechá-lo.
  const isOpen = (k: string, auto = false) => forceOpen || (open[k] ?? auto)
  // Link de naipe/instrumento (?naipe=Percussão&inst=Caixa): abre esse grupo na lista.
  const wantNaipe = params.get('naipe'), wantInst = params.get('inst')
  const openedFor = useRef('')
  useEffect(() => {
    if (!wantNaipe || tree.searching || openedFor.current === wantNaipe + '|' + wantInst) return
    const sec = tree.data.sectionList.find((s) => s.name === wantNaipe)
    if (!sec) return
    openedFor.current = wantNaipe + '|' + wantInst
    const sk0 = `${activeCycleId}:${sec.id}`
    const leaves = [...(tree.data.map.get(sec.id)?.get('')?.values() ?? [])].filter((l) => !wantInst || l.label === wantInst)
    setOpen((o) => ({ ...o, [sk0]: true, ...Object.fromEntries(leaves.map((l) => [`${sk0}:${l.key}`, true])) }))
  }, [wantNaipe, wantInst, tree, activeCycleId])
  const loading = members.isLoading || sections.isLoading || instruments.isLoading || allRows.isLoading

  // Dois integrantes com o mesmo primeiro nome (dois "Leonardo"): a linha ganha o último sobrenome, além do "como prefere ser chamado" embaixo.
  const givenCounts = new Map<string, number>()
  for (const m of members.data ?? []) { const k = givenName(m.full_name, m.display_name).toLowerCase(); givenCounts.set(k, (givenCounts.get(k) ?? 0) + 1) }
  const rowName = (m: { full_name: string; display_name: string | null }) => ((givenCounts.get(givenName(m.full_name, m.display_name).toLowerCase()) ?? 0) > 1 ? nameWithSurname(m.full_name, m.display_name) : givenName(m.full_name, m.display_name))
  const memberRow = (m: GroupMember) => {
    const st = statusOf(m.id)
    const dim = !st?.counts_as_active && !st?.is_waitlist
    const wa = m.phone ? hrefOf({ kind: 'whatsapp', label: '', value: m.phone }) : null
    return (
      <div key={m.id} className={cn('flex items-center justify-between gap-2 rounded-md px-3 py-2', dim ? 'bg-muted/60 text-muted-foreground opacity-75' : 'bg-card')}>
        <MemberAvatar memberId={m.id} name={m.full_name} />
        <div className="min-w-0 flex-1">
          <button type="button" className="block w-full min-w-0 text-left" onClick={() => setSelected(m)}>
            <p className={cn('flex flex-wrap items-center gap-x-1.5 font-semibold', dim && 'font-medium')}>
              <span className="break-words">{rowName(m)}</span>
              {st && !st.counts_as_active && <Badge>{pastCycle && !st.is_waitlist ? 'Não participou' : st.name}</Badge>}
              {[...typesOf(m.id)].map((t) => <Badge key={t} className="bg-muted">{typeBadge(t)}</Badge>)}
            </p>
            {m.display_name?.trim() && sameName(m.display_name, givenName(m.full_name, m.display_name)) === false && <p className="break-words text-muted-foreground">{m.display_name.trim()}</p>}
          </button>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-success" title="Conversar no WhatsApp" aria-label={`Conversar com ${m.full_name} no WhatsApp`}>
              <WhatsAppIcon className="h-4 w-4 text-success" /> {maskPhone(m.phone ?? '')}
            </a>
          )}
        </div>
        <Button size="icon" variant="ghost" aria-label={`${canEditMembers ? 'Editar' : 'Ver'} ficha de ${shortName(m?.full_name, m?.display_name)}`} title={canEditMembers ? 'Editar ficha' : 'Ver ficha'} onClick={() => setSelected(m)}>{canEditMembers ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
      </div>
    )
  }

  const renderSections = (t: TreeData) => t.sectionList.map((sec, idx) => {
    const tone: Tone = TONES[idx % TONES.length]
    const subs = t.map.get(sec.id)!
    const count = new Set([...subs.values()].flatMap((l) => [...l.values()].flatMap((x) => x.members.map((m) => m.id)))).size
    const renderLeaves = (leaves: Map<string, Leaf>, p: string) =>
      [...leaves.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).map((leaf) => leaf.members.length === 1 ? (
        <Collapsible key={p + leaf.key} level={1} tone={tone} title={leaf.label} expandable={false} open={false} onToggle={() => {}} below={memberRow(leaf.members[0])}>{null}</Collapsible>
      ) : (
        <Collapsible key={p + leaf.key} level={1} tone={tone} title={leaf.label} count={leaf.members.length} open={isOpen(p + leaf.key, leaves.size === 1)} onToggle={() => toggle(p + leaf.key, isOpen(p + leaf.key, leaves.size === 1))}>
          <ProgressiveList items={leaf.members} render={memberRow} resetKey={filter.search + activeCycleId} />
        </Collapsible>
      ))
    const sk0 = `${activeCycleId}:${sec.id}`
    if (count === 1) {
      return (
        <Collapsible key={sk0} tone={tone} title={sec.name} expandable={false} open={false} onToggle={() => {}} below={<div className="space-y-2">{renderLeaves(subs.get('') ?? new Map(), `${sk0}:`)}</div>}>{null}</Collapsible>
      )
    }
    return (
      <Collapsible key={sk0} tone={tone} title={sec.name} count={count} open={isOpen(sk0, t.sectionList.length === 1)} onToggle={() => toggle(sk0, isOpen(sk0, t.sectionList.length === 1))}>
        <div className="space-y-2">{renderLeaves(subs.get('') ?? new Map(), `${sk0}:`)}</div>
      </Collapsible>
    )
  })

  /** "Meus alunos": com um naipe só, preenche Naipe (e Atividade, se for uma atribuição só); com vários naipes, soma tudo o que a pessoa atende. Mexer nos menus desliga o chip. */
  const toggleMine = () => {
    if (mine) { setMine(false); setNaipeF(''); setAtvF(''); return }
    const list = myStaff.data ?? []
    const instById = new Map((instruments.data ?? []).map((i) => [i.id, i]))
    const secOf = (a: { section_id: string | null; instrument_id: string | null }) => a.section_id ?? (a.instrument_id ? instById.get(a.instrument_id)?.section_id ?? null : null)
    const secs = [...new Set(list.map(secOf).filter(Boolean))] as string[]
    if (secs.length === 1) {
      setNaipeF(secs[0]); setAtvF(list.length === 1 && list[0].instrument_id ? list[0].instrument_id : '')
      setMine(true)
    } else { setNaipeF(''); setAtvF(''); setMine(true) }
  }
  const chip = (on: boolean) => cn('rounded-full border px-2.5 py-1.5 text-center text-xs font-semibold leading-tight', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')

  return (
    <div className="space-y-4">
      <h1>{title}</h1>
      {/* Regra 7: botão de adicionar tracejado, com "+" e texto, em 100 % da largura sob o título. */}
      <Can permission="members.manage">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <Button variant="add" className="w-full" onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4" /> Novo integrante</Button>
          <NewMemberSheet onClose={() => setSheetOpen(false)} />
        </Sheet>
      </Can>
      <ParticipationRequests />

      <div className="space-y-3">
        <ButtonRow role="group" aria-label="Situação">
          {([[showActive, setShowActive, showInactive, pastCycle ? 'Participaram' : 'Ativos'], [showInactive, setShowInactive, showActive, pastCycle ? 'Não participaram' : 'Inativos']] as const).map(([on, set, other, label]) => (
            <button key={label} type="button" aria-pressed={on} className={chip(on)} onClick={() => { if (on && !other) return; set(!on) }}>{label}</button>
          ))}
        </ButtonRow>
        {!lockedCategory && (
          <>
            {/* Divisória sutil entre a situação (Ativos/Inativos) e o tipo: uma linha fina que some nas pontas. */}
            <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
            {/* Sem caber numa linha, 3 + 2 (nunca um por linha): os curtos em cima, os longos embaixo. */}
            <ButtonRow role="group" aria-label="Tipo de integrante" split={[3, 2]}>
              {TYPE_OPTIONS.map(([k, label0]) => { const label = typeChip(k, label0); return (
                <button key={k} type="button" aria-pressed={types.has(k)} className={chip(types.has(k))}
                  onClick={() => setTypes((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n })}>{label}</button>
              ) })}
            </ButtonRow>
          </>
        )}
      </div>
      <p className="text-muted-foreground">{total} {total === 1 ? 'integrante' : 'integrantes'} em {activeCycle?.name ?? 'ciclo'}</p>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Filter className="h-4 w-4" aria-hidden /> Filtrar</p>
          {(myStaff.data?.length ?? 0) > 0 && (
            <button type="button" aria-pressed={mine} className={cn(chip(mine), 'inline-flex items-center gap-1')} onClick={toggleMine}>Meus alunos <Heart className={cn('h-3.5 w-3.5', mine && 'fill-current')} aria-hidden /></button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Naipe" value={naipeF} onChange={(e) => { setNaipeF(e.target.value); setAtvF(''); setMine(false) }}>
            <option value="">Todos os naipes</option>
            {(sections.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Select aria-label="Atividade" value={atvF} disabled={!naipeF} onChange={(e) => { setAtvF(e.target.value); setMine(false) }}>
            <option value="">{naipeF ? 'Todas as atividades' : 'Escolha o naipe antes'}</option>
            {(instruments.data ?? []).filter((i) => i.is_active && i.section_id === naipeF).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" type="search" aria-label="Buscar integrante pelo nome" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <ReactivationRequests />
      {members.isError && <Card className="p-4 text-destructive">{friendlyError(members.error)}</Card>}
      {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}

      {renderSections(tree.data)}
      {!loading && total === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum integrante encontrado neste ciclo com esses filtros.</Card>}

      <Sheet open={selected !== null} onOpenChange={(o) => !o && closeSheet()}>
        {selected && <MemberDetailSheet onArchived={() => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['members-archived'] }); closeSheet() }} onCrumbClick={stayOnList} member={selected} category={categoryOf.get(selected.id)?.category_name} onChanged={(p) => setSelected((s) => (s ? { ...s, ...p } : s))} />}
      </Sheet>

      <MembersTrash />
    </div>
  )
}
