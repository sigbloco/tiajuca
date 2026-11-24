import { purgeErrorMessage, purgeTrashed } from '@/core/purge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { SaveInput } from '@/components/shared/ConfirmField'
import { promptBox } from '@/components/shared/DialogHost'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { PageLink } from '@/components/shared/PageLink'
import { confirmBox } from '@/components/shared/DialogHost'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { CatalogEditor, useCatalog } from '@/modules/structure/CatalogEditor'
import { invalidateCatalog, saveCatalogItem, type CatalogTable } from '@/modules/structure/service'
import { FormSettingsTabs } from './FormSettingsTabs'

/** As três listas originais: ficam sempre (não podem ser apagadas), mas mudam de ordem como as demais. */
const SYSTEM: Record<string, { title: string; singular: string; hint: string }> = {
  skill_levels: { title: 'Níveis', singular: 'Nível', hint: 'O nível é uma autodeclaração: a pessoa diz que nível acredita ter (ex.: Iniciante, Intermediário, Avançado).' },
  gender_options: { title: 'Como você se identifica?', singular: 'Opção', hint: 'Dado sensível: fica restrito à direção.' },
  race_options: { title: 'Como você identifica sua cor/raça?', singular: 'Opção', hint: 'Dado sensível: fica restrito à direção.' },
  social_networks: { title: 'Redes sociais', singular: 'Rede', hint: 'Em cada rede, o endereço do perfil com {handle} no lugar do usuário (a pessoa só digita o usuário). Ex.: https://www.youtube.com/@{handle}. Em cada pergunta de rede social, você marca quais redes aparecem.' },
}

interface ListRow { id: string; name: string; kind: 'system' | 'custom'; source: string | null; sort_order: number; is_active: boolean; link: 'skill_level' | null }
interface ItemRow { id: string; list_id: string; name: string; sort_order: number; is_active: boolean; description?: string | null }
interface TrashRow { key: string; id: string; name: string; label: string; table?: CatalogTable; list?: boolean; level?: boolean }

function useFormLists() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-lists', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_lists').select('id, name, kind, source, sort_order, is_active, link').eq('organization_id', orgId).order('sort_order').limit(500)
      if (error) throw error
      return (data ?? []) as ListRow[]
    },
  })
}
/** Níveis das listas ligadas ao integrante (linhas de skill_levels com list_id). */
function useLevelItems() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-level-items', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('skill_levels').select('id, list_id, name, sort_order, is_active, description').eq('organization_id', orgId).not('list_id', 'is', null).order('sort_order').limit(5000)
      if (error) throw error
      return (data ?? []) as ItemRow[]
    },
  })
}
function useFormListItems() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-list-items', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_list_items').select('id, list_id, name, sort_order, is_active, description').eq('organization_id', orgId).order('sort_order').limit(5000)
      if (error) throw error
      return (data ?? []) as ItemRow[]
    },
  })
}

/** Itens de uma lista criada por aqui. */
function CustomListBody({ list, items, canEdit }: { list: ListRow; items: ItemRow[]; canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const drag = useHoldReorder()
  // Lista ligada ao integrante como lista de níveis: os itens são os próprios níveis (skill_levels).
  const table = list.link === 'skill_level' ? 'skill_levels' : 'form_list_items'
  const refresh = () => { for (const k of ['form-list-items', 'form-level-items', 'form-lists', 'catalog']) qc.invalidateQueries({ queryKey: [k, orgId] }) }
  const onError = (e: unknown) => toast.error(friendlyError(e))
  const active = items.filter((i) => i.is_active)
  const add = useMutation({
    mutationFn: async () => { const { error } = await supabase.from(table).insert({ organization_id: orgId, list_id: list.id, name: name.trim(), sort_order: items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1 }); if (error) throw error },
    onSuccess: () => { setName(''); refresh() }, onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<ItemRow> }) => { const { error } = await supabase.from(table).update(v.patch).eq('id', v.id); if (error) throw error },
    onSuccess: refresh, onError,
  })
  const rename = useMutation({
    mutationFn: async (n: string) => { const { error } = await supabase.from('form_lists').update({ name: n }).eq('id', list.id); if (error) throw error },
    onSuccess: refresh, onError,
  })
  const reorder = useMutation({
    mutationFn: async (order: ItemRow[]) => {
      const r = await Promise.all(order.map((t, i) => (t.sort_order === i + 1 ? null : supabase.from(table).update({ sort_order: i + 1 }).eq('id', t.id))))
      const bad = r.find((x) => x?.error); if (bad?.error) throw bad.error
    },
    onSuccess: refresh, onError,
  })
  const moveTo = (fromId: string, toId: string) => {
    const arr = [...active]; const from = arr.findIndex((t) => t.id === fromId), to = arr.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const [t] = arr.splice(from, 1); arr.splice(to, 0, t); reorder.mutate(arr)
  }
  const swap = (i: number, j: number) => { const arr = [...active]; ;[arr[i], arr[j]] = [arr[j], arr[i]]; reorder.mutate(arr) }
  return (
    <div className="space-y-3">
      {list.link === 'skill_level' && <p className="text-sm"><Badge>Ligada ao integrante</Badge> <span className="text-muted-foreground">Estes itens são níveis: o que a pessoa escolher vai para o cadastro dela, como nos níveis padrão.</span></p>}
      {canEdit && !list.link && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Ligação com o integrante</p>
          <Select aria-label="Ligação com o integrante" value="" onChange={async (e) => {
            if (e.target.value !== 'skill_level') return
            if (!(await confirmBox('Ligar esta lista como lista de níveis? Os itens passam a ser níveis que ficam no cadastro de quem escolher. Depois de ligada, não dá para desligar.'))) return
            const { error } = await supabase.rpc('link_list_to_levels', { p_list: list.id })
            if (error) toast.error(friendlyError(error)); else { toast.success('Lista ligada ao nível do integrante.'); refresh() }
          }}>
            <option value="">Nenhuma (só histórico das respostas)</option>
            <option value="skill_level">Nível do integrante</option>
          </Select>
        </div>
      )}
      {canEdit && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Nome da lista</p>
          <SaveInput value={list.name} aria-label="Nome da lista" onSave={(v) => rename.mutateAsync(v)} />
        </div>
      )}
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <Input className="min-w-40 flex-1" placeholder="Novo item" aria-label="Novo item" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="add" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      {active.length === 0 && <EmptyState>Nenhum item ainda.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={active} render={(item, i) => (
          <Card key={item.id} {...(canEdit ? drag.row(item.id, moveTo, `list-${list.id}`) : {})} className={cn('flex flex-wrap items-center gap-2 p-2', drag.cls(item.id))}>
            <div className="flex flex-col items-center">
              <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Subir" disabled={!canEdit || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="h-4 w-4" /></Button>
              {canEdit && drag.handle(item.id, moveTo, `list-${list.id}`)}
              <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Descer" disabled={!canEdit || i === active.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="h-4 w-4" /></Button>
            </div>
            <SaveInput value={item.name} disabled={!canEdit} aria-label={`Nome de ${item.name}`} onSave={(v) => patch.mutateAsync({ id: item.id, patch: { name: v } })} />
            {canEdit && <Button size="icon" variant="outline" className="text-destructive" aria-label={`Mover ${item.name} para a lixeira`} title="Mover para a lixeira" onClick={() => patch.mutate({ id: item.id, patch: { is_active: false } })}><Trash2 className="h-4 w-4" /></Button>}
            <div className="basis-full"><SaveInput value={item.description ?? ''} allowEmpty disabled={!canEdit} placeholder="Descrição" aria-label={`Descrição de ${item.name}`} onSave={(v) => patch.mutateAsync({ id: item.id, patch: { description: v.trim() || null } })} /></div>
          </Card>
        )} />
      </div>
    </div>
  )
}

/** Formulários → Configurações → Listas: as listas do cadastro usadas por todos os formulários. Dá para criar outras e mudar a ordem; a lixeira é uma só, no fim. */
export function FormListsPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canEdit = usePermission('forms.manage')
  const lists = useFormLists()
  const customItems = useFormListItems()
  const levelItems = useLevelItems()
  const itemsOf = (l: ListRow) => ((l.link ? levelItems.data : customItems.data) ?? []).filter((x) => x.list_id === l.id)
  const levels = useCatalog('skill_levels'), genders = useCatalog('gender_options'), races = useCatalog('race_options'), networks = useCatalog('social_networks')
  const sys: Record<string, ReturnType<typeof useCatalog>> = { skill_levels: levels, gender_options: genders, race_options: races, social_networks: networks }
  const [opened, setOpened] = useState<Set<string>>(new Set()) // começam todas recolhidas
  const [trashOpen, setTrashOpen] = useState(false)
  const drag = useHoldReorder()
  const toggle = (t: string) => setOpened((cur) => { const n = new Set(cur); if (n.has(t)) n.delete(t); else n.add(t); return n })
  const refreshLists = () => qc.invalidateQueries({ queryKey: ['form-lists', orgId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))

  // As listas originais viram linhas (para terem ordem) na primeira visita de quem pode editar.
  const seeded = lists.data && Object.keys(SYSTEM).every((s) => lists.data!.some((l) => l.source === s))
  useEffect(() => {
    if (!canEdit || !lists.data || seeded) return
    const base = lists.data.reduce((m, l) => Math.max(m, l.sort_order), 0)
    const missing = Object.entries(SYSTEM).filter(([s]) => !lists.data!.some((l) => l.source === s)).map(([s, v], i) => ({ organization_id: orgId, name: v.title, kind: 'system', source: s, sort_order: base + i + 1 }))
    void supabase.from('form_lists').upsert(missing, { onConflict: 'organization_id,source', ignoreDuplicates: true }).then(refreshLists)
  }, [canEdit, lists.data, seeded])

  const all = lists.data ?? []
  const active = all.filter((l) => l.is_active)
  const reorder = useMutation({
    mutationFn: async (order: ListRow[]) => {
      const r = await Promise.all(order.map((t, i) => (t.sort_order === i + 1 ? null : supabase.from('form_lists').update({ sort_order: i + 1 }).eq('id', t.id))))
      const bad = r.find((x) => x?.error); if (bad?.error) throw bad.error
    },
    onSuccess: refreshLists, onError,
  })
  const moveTo = (fromId: string, toId: string) => {
    const arr = [...active]; const from = arr.findIndex((t) => t.id === fromId), to = arr.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const [t] = arr.splice(from, 1); arr.splice(to, 0, t); reorder.mutate(arr)
  }
  const swap = (i: number, j: number) => { const arr = [...active]; ;[arr[i], arr[j]] = [arr[j], arr[i]]; reorder.mutate(arr) }
  const create = useMutation({
    mutationFn: async (name: string) => { const { error } = await supabase.from('form_lists').insert({ organization_id: orgId, name, kind: 'custom', sort_order: all.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1 }); if (error) throw error },
    onSuccess: () => { toast.success('Lista criada.'); refreshLists() }, onError,
  })
  // Duplicar: cria uma lista nova (sua) com os mesmos itens. Cópia de uma lista de níveis continua sendo lista de níveis.
  const duplicate = useMutation({
    mutationFn: async (v: { l: ListRow; name: string }) => {
      const src = v.l.source ? (sys[v.l.source]?.data ?? []).filter((i) => i.is_active).map((i) => ({ name: i.name, description: (i as { description?: string | null }).description ?? null })) : itemsOf(v.l).filter((i) => i.is_active).map((i) => ({ name: i.name, description: i.description ?? null }))
      const levelType = v.l.source === 'skill_levels' || v.l.link === 'skill_level'
      const { data: created, error } = await supabase.from('form_lists').insert({ organization_id: orgId, name: v.name, kind: 'custom', sort_order: all.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1 }).select('id').single()
      if (error) throw error
      const id = (created as { id: string }).id
      if (src.length > 0) {
        const { error: e2 } = await supabase.from('form_list_items').insert(src.map((x, i) => ({ organization_id: orgId, list_id: id, name: x.name, description: x.description, sort_order: i + 1 })))
        if (e2) throw e2
      }
      if (levelType) {
        const { error: e3 } = await supabase.rpc('link_list_to_levels', { p_list: id }); if (e3) throw e3
        const { error: e4 } = await supabase.from('form_list_items').delete().eq('list_id', id); if (e4) throw e4
      }
    },
    onSuccess: () => { toast.success('Lista duplicada.'); void qc.invalidateQueries() }, onError,
  })
  const setListActive = useMutation({
    mutationFn: async (v: { id: string; on: boolean }) => { const { error } = await supabase.from('form_lists').update({ is_active: v.on }).eq('id', v.id); if (error) throw error },
    onSuccess: refreshLists, onError,
  })
  const restoreItem = useMutation({
    mutationFn: async (e: TrashRow) => {
      if (e.table) await saveCatalogItem(e.table, orgId, { id: e.id, name: e.name, is_active: true })
      else { const { error } = await supabase.from(e.level ? 'skill_levels' : 'form_list_items').update({ is_active: true }).eq('id', e.id); if (error) throw error }
    },
    onSuccess: () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['form-list-items', orgId] }); qc.invalidateQueries({ queryKey: ['form-level-items', orgId] }) }, onError,
  })

  const purgeAny = useMutation({
    mutationFn: (e: TrashRow) => purgeTrashed(e.list ? 'form_lists' : e.table ?? (e.level ? 'skill_levels' : 'form_list_items'), e.id),
    onSuccess: () => { toast.success('Excluído de vez.'); void qc.invalidateQueries() },
    onError: (e) => toast.error(purgeErrorMessage(e)),
  })
  // Lixeira única: listas apagadas + itens apagados de todas as listas que continuam ativas.
  const trash: TrashRow[] = [
    ...all.filter((l) => !l.is_active && l.kind === 'custom').map((l): TrashRow => ({ key: `l-${l.id}`, id: l.id, name: l.name, label: 'Lista', list: true })),
    ...active.flatMap((l): TrashRow[] => l.kind === 'system' && l.source
      ? (sys[l.source]?.data ?? []).filter((i) => !i.is_active).map((i) => ({ key: `s-${i.id}`, id: i.id, name: i.name, label: SYSTEM[l.source!].title, table: l.source as CatalogTable }))
      : itemsOf(l).filter((i) => !i.is_active).map((i) => ({ key: `c-${i.id}`, id: i.id, name: i.name, label: l.name, level: !!l.link }))),
  ]

  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <div className="space-y-2">
        <p className="text-muted-foreground">
          Definidas uma vez e usadas em todos os formulários. No editor de cada pergunta ligada ao cadastro, você marca quais itens aparecem.
          Instrumentos ficam em <PageLink to="naipes">Naipes e instrumentos</PageLink> e categorias em <PageLink to="funcoes">Organização → Categorias</PageLink>.
        </p>
        {canEdit && <Button variant="add" className="w-full" disabled={create.isPending} onClick={async () => { const n = await promptBox({ title: 'Nova lista', message: 'Nome da lista:', confirmLabel: 'Criar' }); if (n && n.trim()) create.mutate(n.trim()) }}><Plus className="h-4 w-4" /> Nova lista</Button>}
      </div>
      {lists.isLoading && <Skeleton className="h-24" />}
      <div className="space-y-2">
        {active.map((l, i) => {
          const sd = l.source ? SYSTEM[l.source] : undefined
          const cat = l.source ? sys[l.source]?.data : undefined
          const count = sd ? cat?.filter((x) => x.is_active).length : itemsOf(l).filter((x) => x.is_active).length
          return (
            <Collapsible key={l.id} open={opened.has(l.id)} onToggle={() => toggle(l.id)} title={sd?.title ?? l.name} count={count}
              left={canEdit && (
                <div className="flex flex-col items-center" {...drag.row(l.id, moveTo, 'form-lists')}>
                  <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Subir" disabled={i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  {drag.handle(l.id, moveTo, 'form-lists')}
                  <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Descer" disabled={i === active.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                </div>
              )}
              right={canEdit && (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" aria-label={`Duplicar ${sd?.title ?? l.name}`} title="Duplicar" disabled={duplicate.isPending} onClick={async () => { const n = await promptBox({ title: 'Duplicar lista', message: 'Nome da nova lista:', initial: `${sd?.title ?? l.name} (cópia)`, confirmLabel: 'Duplicar', required: true }); if (n && n.trim()) duplicate.mutate({ l, name: n.trim() }) }}><Copy className="h-4 w-4" /></Button>
                  {l.kind === 'custom' && <Button size="icon" variant="outline" className="text-destructive" aria-label={`Mover a lista ${l.name} para a lixeira`} title="Mover para a lixeira" onClick={() => setListActive.mutate({ id: l.id, on: false })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              )}>
              {sd && l.source
                ? <CatalogEditor table={l.source as CatalogTable} title="" singular={sd.singular} canEdit={canEdit} hint={sd.hint} noFilter trashMode externalTrash withDescription withNaipes={l.source === 'skill_levels'} withUrl={l.source === 'social_networks'} />
                : <CustomListBody list={l} items={itemsOf(l)} canEdit={canEdit} />}
            </Collapsible>
          )
        })}
        {/* Lixeira: sempre o último grupo, uma só para todas as listas. */}
        <Collapsible open={trashOpen} onToggle={() => setTrashOpen((v) => !v)} title="Lixeira" count={trash.length} tone="muted">
          {trash.length === 0 && <EmptyState>A lixeira está vazia.</EmptyState>}
          <ProgressiveList items={trash} render={(e) => (
            <Card key={e.key} className="flex items-center justify-between gap-3 p-2.5">
              <div className="min-w-0"><p className="break-words font-semibold">{e.name}</p><p className="text-xs text-muted-foreground">{e.list ? 'Lista inteira' : `Da lista ${e.label}`}</p></div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => (e.list ? setListActive.mutate({ id: e.id, on: true }) : restoreItem.mutate(e))}><RotateCcw className="h-4 w-4" /> Restaurar</Button>
                  <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${e.name} de vez`} title="Excluir de vez" onClick={async () => { if (await confirmBox(`Excluir “${e.name}” de vez? Isso não pode ser desfeito.`)) purgeAny.mutate(e) }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </Card>
          )} />
        </Collapsible>
      </div>
    </div>
  )
}
