import { plural } from '@/core/format'
import { VarsHint } from '@/components/shared/VarsHint'
import { StickySave } from '@/components/shared/StickySave'
import { requireFields } from '@/core/required'
import { SaveButton } from '@/components/shared/SaveButton'
import { RichTextarea } from '@/components/shared/RichText'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Label, Select, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { keyify, useForm, type FormFieldRow } from './service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import type { CatalogItem } from '@/modules/structure/service'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { type Network } from '@/core/social'
import { PageLink } from '@/components/shared/PageLink'
import { useSocialNetworks } from './socialNetworks'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, isLoginSection, isSection, type FieldOption, type FieldType } from './types'

export const OPTION_TYPES: FieldType[] = ['single_select', 'multi_select']

/** Tipo escolhido no editor: os de sempre mais "Redes sociais" (texto longo com rede + usuário). */
export type TypeChoice = FieldType | 'social'

export const TYPE_LABEL: Record<TypeChoice, string> = { ...FIELD_TYPE_LABEL, social: 'Redes sociais' }

/** Seção (id do cabeçalho) em que cada campo está; "" = antes da primeira seção. */
export function sectionIds(fields: FormFieldRow[]): Map<string, string> {
  const out = new Map<string, string>()
  let cur = ''
  for (const x of fields) { if (isSection(x)) cur = x.id; out.set(x.id, cur) }
  return out
}

/** Nova ordem dos campos depois de pôr `item` no fim da seção `sectionId` ("" = antes da primeira seção). */
export function placeInSection(fields: FormFieldRow[], item: FormFieldRow, sectionId: string): FormFieldRow[] {
  const rest = fields.filter((x) => x.id !== item.id)
  const where = sectionIds(rest)
  let at = rest.length
  if (sectionId === '') { const first = rest.findIndex((x) => isSection(x)); at = first < 0 ? rest.length : first }
  else {
    const head = rest.findIndex((x) => x.id === sectionId)
    if (head >= 0) { at = head + 1; while (at < rest.length && where.get(rest[at].id) === sectionId) at++ }
  }
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}

export function FieldSheet({ formId, field, fields, nextOrder, onClose, asSection, defaultSection, templateMode }: { /** Editando uma seção modelo: o nome da seção é o nome do modelo. */ templateMode?: boolean; asSection?: boolean; defaultSection?: string; formId: string; field: FormFieldRow | null; fields: FormFieldRow[]; nextOrder: number; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const formRow = useForm(formId)
  const [f, setF] = useState({
    label: field?.label ?? '', description: field?.description ?? '',
    type: (asSection ? 'info' : field?.field_type === 'long_text' && field.validation.social ? 'social' : field?.field_type ?? 'short_text') as TypeChoice,
    netKeys: (field?.validation.networks?.length ? field.validation.networks : null) as string[] | null,
    other: !!field?.validation.other, required: field?.required ?? false,
    options: (field?.options ?? []).map((o) => o.label).join('\n'),
    min: field?.validation.min?.toString() ?? '', max: field?.validation.max?.toString() ?? '',
    condField: field?.condition?.field ?? '', condOp: field?.condition?.op ?? 'eq', condValue: field?.condition?.value ?? '',
    mapping: field?.member_mapping ?? '',
  })
  const sections = fields.filter((x) => isSection(x) && !isLoginSection(x))
  const instruments = useCatalog('instruments')
  const levels = useCatalog('skill_levels')
  const nets: Network[] = useSocialNetworks()
  const functions = useCatalog('artistic_functions')
  const genders = useCatalog('gender_options')
  const races = useCatalog('race_options')
  const naipes = useCatalog('sections')
  const { cycleId, cycle } = useSelectedCycle()
  const [naipe, setNaipe] = useState('')
  // Listas fixas do cadastro (instrumento, categoria, nível): o que estiver marcado aparece no formulário.
  const [picked, setPicked] = useState<Set<string>>(() => new Set((field?.options ?? []).map((o) => o.value)))
  // Descrição de cada item: a pergunta pode mostrá-la; o texto vem do cadastro e pode ser editado aqui sem mudar o cadastro (vazio = usa o do cadastro).
  const [showDesc, setShowDesc] = useState(!!field?.validation.descriptions)
  const [descs, setDescs] = useState<Record<string, string>>({})
  const overview = useQuery({
    queryKey: ['form-instrument-vagas', orgId, cycleId],
    enabled: Boolean(cycleId) && f.mapping === 'link.instrument',
    queryFn: async () => {
      const { data, error } = await supabase.from('v_instrument_cycle_overview').select('instrument_id, instrument_name, section_id, is_full').eq('organization_id', orgId).eq('cycle_id', cycleId).order('section_order').order('instrument_order')
      if (error) throw error
      return (data ?? []) as { instrument_id: string; instrument_name: string; section_id: string; is_full: boolean }[]
    },
  })
  // Fonte das opções: uma lista criada em Formulários → Configurações → Listas (só quando a pergunta não está ligada ao cadastro).
  const [listSource, setListSource] = useState<string>(field?.validation.listSource ?? '')
  const src = f.mapping && f.mapping !== 'member.custom' ? '' : listSource
  // Pergunta ligada ao nível do integrante: pode usar a lista padrão ou uma lista de níveis ligada (ex.: níveis de pernalta).
  const [levelList, setLevelList] = useState<string>(field?.validation.levelList ?? '')
  const levelItems = useQuery({
    queryKey: ['form-level-items', orgId, levelList],
    enabled: f.mapping === 'link.skill_level' && Boolean(levelList),
    queryFn: async () => { const { data, error } = await supabase.from('skill_levels').select('id, name, sort_order, is_active, description').eq('list_id', levelList).order('sort_order'); if (error) throw error; return (data ?? []) as CatalogItem[] },
  })
  const customLists = useQuery({
    queryKey: ['form-lists', orgId, 'custom-active'],
    queryFn: async () => { const { data, error } = await supabase.from('form_lists').select('id, name, link').eq('organization_id', orgId).eq('kind', 'custom').eq('is_active', true).order('sort_order'); if (error) throw error; return (data ?? []) as { id: string; name: string; link: string | null }[] },
  })
  const customItems = useQuery({
    queryKey: ['form-list-items', orgId, src],
    enabled: Boolean(src),
    queryFn: async () => { const { data, error } = await supabase.from('form_list_items').select('id, name, sort_order, is_active, description').eq('list_id', src).order('sort_order'); if (error) throw error; return (data ?? []) as { id: string; name: string; sort_order: number; is_active: boolean; description: string | null }[] },
  })
  const linkMapped = f.mapping.startsWith('link.')
  // Listas do cadastro (marcar quais itens aparecem): instrumento, categoria, nível, gênero e cor/raça.
  const listMapped = linkMapped || f.mapping === 'sensitive.gender' || f.mapping === 'sensitive.race_color' || !!src
  const catalogItems: CatalogItem[] = (src ? customItems.data :  f.mapping === 'link.instrument' ? instruments.data : f.mapping === 'link.skill_level' ? (levelList ? levelItems.data : levels.data) : f.mapping === 'link.function' ? functions.data : f.mapping === 'sensitive.gender' ? genders.data : f.mapping === 'sensitive.race_color' ? races.data : [])
    ?.filter((i) => i.is_active).slice().sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0) || x.name.localeCompare(y.name, 'pt-BR')) ?? []
  const naipeList = (naipes.data ?? []).filter((n) => n.is_active).slice().sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
  const activeNaipe = naipe || naipeList[0]?.id || ''
  const shown = f.mapping === 'link.instrument' ? catalogItems.filter((i) => i.section_id === activeNaipe) : catalogItems
  const fullIds = new Set((overview.data ?? []).filter((r) => r.is_full).map((r) => r.instrument_id))
  const catalogSig = catalogItems.map((i) => i.id).join(',')
  useEffect(() => {
    if (!field || catalogItems.length === 0) return
    const labels = new Set(field.options.map((o) => o.label.trim().toLowerCase()))
    const values = new Set(field.options.map((o) => o.value))
    setPicked(new Set(catalogItems.filter((i) => values.has(i.id) || labels.has(i.name.trim().toLowerCase())).map((i) => i.id)))
    const own: Record<string, string> = {}
    for (const i of catalogItems) { const o = field.options.find((x) => x.value === i.id || x.value === i.name || x.label.trim().toLowerCase() === i.name.trim().toLowerCase()); if (o?.description !== undefined) own[i.id] = o.description }
    setDescs(own)
  }, [catalogSig])
  // Ao escolher uma lista, todos os itens começam marcados (dá para desmarcar).
  const autoPick = useRef('')
  const autoLevel = useRef('')
  useEffect(() => {
    if (f.mapping !== 'link.skill_level' || !levelList || autoLevel.current === levelList || !levelItems.data || levelItems.data.length === 0) return
    autoLevel.current = levelList
    if (field?.validation.levelList === levelList && (field?.options.length ?? 0) > 0) return
    setPicked(new Set(levelItems.data.filter((i) => i.is_active).map((i) => i.id)))
  }, [f.mapping, levelList, levelItems.data])
  useEffect(() => {
    if (!src || autoPick.current === src || !customItems.data || customItems.data.length === 0) return
    autoPick.current = src
    if (field?.validation.listSource === src && (field?.options.length ?? 0) > 0) return
    setPicked(new Set(customItems.data.filter((i) => i.is_active).map((i) => i.id)))
  }, [src, customItems.data])
  const togglePicked = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setShownPicked = (on: boolean) => setPicked((cur) => { const n = new Set(cur); for (const i of shown) { if (on) n.add(i.id); else n.delete(i.id) } return n })
  const currentSection = field ? sectionIds(fields).get(field.id) ?? '' : defaultSection ?? sections[sections.length - 1]?.id ?? ''
  const [sectionId, setSectionId] = useState(currentSection)
  const earlier = fields.filter((x) => x.is_active && x.field_type !== 'info' && x.id !== field?.id && (field ? x.sort_order < field.sort_order : true))
  const parent = earlier.find((x) => x.field_key === f.condField)
  const parentOptions: FieldOption[] = f.condField === '_naipe' ? (naipes.data ?? []).filter((n) => n.is_active).map((n) => ({ value: n.id, label: n.name })) : !parent ? [] : parent.field_type === 'yes_no' ? [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]
    : parent.field_type === 'checkbox' ? [{ value: 'true', label: 'Marcado' }, { value: 'false', label: 'Desmarcado' }] : parent.options

  // Mantém o valor interno de opções com o mesmo rótulo (respostas antigas seguem consistentes).
  const toOptions = (): FieldOption[] => {
    // Listas do cadastro: só os marcados, na ordem do cadastro (o valor é o código do item, que liga ao integrante).
    // Instrumento, categoria e nível guardam o código do item (liga ao integrante); gênero e cor/raça guardam o próprio nome.
    if (listMapped) return catalogItems.filter((i) => picked.has(i.id)).map((i) => { const d = (descs[i.id] ?? i.description ?? '').trim(); return { value: linkMapped ? i.id : i.name, label: i.name, ...(showDesc && d ? { description: d } : {}) } })
    const existing = new Map((field?.options ?? []).map((o) => [o.label, o.value]))
    const seen = new Set<string>()
    return f.options.split('\n').map((l) => l.trim()).filter(Boolean).map((label) => {
      let v = existing.get(label) ?? keyify(label); let i = 2
      const base = v
      while (seen.has(v)) v = `${base}_${i++}`
      seen.add(v)
      return { value: v, label }
    })
  }
  const save = useMutation({
    mutationFn: async () => {
      const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))
      const validation: Record<string, unknown> = Object.fromEntries(Object.entries({ min: num(f.min), max: num(f.max) }).filter(([, v]) => v !== undefined && !Number.isNaN(v)))
      if (f.type === 'social') {
        validation.social = true
        const picked = nets.filter((n) => f.netKeys === null || f.netKeys.includes(n.key))
        if (picked.length === 0) throw new Error('Escolha ao menos uma rede.')
        if (picked.length < nets.length) validation.networks = picked.map((n) => n.key)
        validation.networkDefs = picked
      }
      if (f.other && OPTION_TYPES.includes(f.type as FieldType) && !f.mapping.startsWith('link.')) validation.other = true
      if (listMapped && showDesc) validation.descriptions = true
      if (src) validation.listSource = src
      if (f.mapping === 'link.skill_level' && levelList) validation.levelList = levelList
      const opts = OPTION_TYPES.includes(f.type as FieldType) ? toOptions() : []
      // Seção e consentimento são campos "info" com uma marca em validation.
      const marks = asSection ? { section: true, ...(field?.validation.login ? { login: true } : {}) } : {}
      const row = {
        label: f.label.trim(), description: f.description.trim() || null, field_type: f.type === 'social' ? 'long_text' : f.type, required: f.type === 'info' ? false : f.required, options: opts, validation: f.type === 'info' ? marks : validation,
        condition: f.condField && f.condValue !== '' ? { field: f.condField, op: f.condOp, value: f.condValue } : null,
        member_mapping: f.mapping || null,
      }
      let id = field?.id ?? ''
      if (field) {
        const { error } = await supabase.from('form_fields').update(row).eq('id', field.id)
        if (error) throw error
        // Modelo de seção: mudar o nome da seção muda o nome do modelo (título da página e lista de modelos).
        // O nome do modelo é sempre o nome da seção dele.
        if (templateMode && asSection && row.label !== field.label) {
          const t = await supabase.from('form_section_templates').select('id, name').eq('form_id', formId).maybeSingle()
          if (t.error) throw t.error
          if (t.data) {
            const a = await supabase.from('form_section_templates').update({ name: row.label }).eq('id', t.data.id)
            if (a.error) throw a.error
            const b = await supabase.from('forms').update({ title: row.label }).eq('id', formId)
            if (b.error) throw b.error
            qc.invalidateQueries({ queryKey: ['form-templates'] })
          }
        }
      } else {
        const { data, error } = await supabase.from('form_fields').insert({ ...row, organization_id: orgId, form_id: formId, field_key: uniqueKey(), sort_order: nextOrder }).select('id').single()
        if (error) throw error
        id = data.id as string
      }
      // Campo novo ou que mudou de seção: vai para o fim da seção escolhida e a ordem é renumerada.
      if (!asSection && sections.length > 0 && (!field || sectionId !== currentSection)) {
        const me = (field ?? { id, sort_order: nextOrder }) as FormFieldRow
        const order = placeInSection(field ? fields : [...fields, me], me, sectionId)
        const r = await Promise.all(order.map((x, i) => (x.sort_order === i + 1 ? null : supabase.from('form_fields').update({ sort_order: i + 1 }).eq('id', x.id))))
        const bad = r.find((x) => x?.error); if (bad?.error) throw bad.error
      }
    },
    onSuccess: () => { toast.success('Campo salvo. Republique para valer no formulário público.'); qc.invalidateQueries({ queryKey: ['form-fields', orgId, formId] }); onClose() },
    onError: (e) => toast.error(/member_mapping|check/i.test(JSON.stringify(e)) ? 'Ligação com o cadastro inválida.' : friendlyError(e)),
  })
  const uniqueKey = () => { const base = keyify(f.label); let k = base, i = 2; const keys = new Set(fields.map((x) => x.field_key)); while (keys.has(k)) k = `${base.slice(0, 36)}_${i++}`; return k }

  const needsOptions = OPTION_TYPES.includes(f.type as FieldType)
  const optionsOk = listMapped ? catalogItems.some((i) => picked.has(i.id)) : Boolean(f.options.trim())
  return (
    <SheetContent crumbExtra={field?.label} title={asSection ? (field ? 'Editar seção' : 'Nova seção') : field ? 'Editar campo' : 'Novo campo'} description={asSection ? 'Agrupa as perguntas que vêm depois, até a próxima seção.' : field ? `Identificador: ${field.field_key}` : 'Pergunta ou bloco do formulário.'}>
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([[asSection ? 'Nome da seção' : 'Nome do campo', f.label.trim()], ['Opções', !needsOptions || optionsOk]])) save.mutate() }} className="space-y-3">
        {!asSection && !templateMode && sections.length > 0 && (
          <div className="space-y-1.5"><Label htmlFor="fl-section">Seção</Label>
            <Select id="fl-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {currentSection === '' && <option value="">Sem seção</option>}
              {sections.map((x) => <option key={x.id} value={x.id}>{x.label}{x.is_active ? '' : ' (desativada)'}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">Ao trocar, o campo vai para o fim da seção escolhida.</p></div>
        )}
        {f.type !== 'info' && f.type !== 'file' && (
          <div className="space-y-1.5"><Label htmlFor="fl-map">Ligar ao cadastro do integrante</Label>
            <Select id="fl-map" value={f.mapping} onChange={(e) => { const m = e.target.value; setF({ ...f, mapping: m, type: (m.startsWith('link.') || m === 'sensitive.gender' || m === 'sensitive.race_color') && !OPTION_TYPES.includes(f.type as FieldType) ? 'single_select' : f.type }) }}>
              <option value="">Não ligar (fica só no histórico da inscrição)</option>
              {Object.entries(MAPPING_LABEL).filter(([k]) => k !== 'member.played_other_blocks' || f.mapping === k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">Ao aprovar, o valor vai direto para o cadastro, sem digitar de novo.{f.mapping === 'link.skill_level' ? ' O nível aparece no cadastro como autodeclarado.' : ''}{f.mapping === 'member.custom' ? ' A resposta vai para “Outras informações”, no fim da ficha do integrante, com o texto da pergunta como título.' : ''}</p></div>
        )}
        {!asSection && <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="fl-type">Tipo</Label>
            <Select id="fl-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as TypeChoice })}>
              {(Object.keys(TYPE_LABEL) as TypeChoice[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select></div>
          {f.type !== 'info' && (
            <label className="mt-6 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Obrigatório</label>
          )}
        </div>}
        {f.type === 'social' && (
          <fieldset className="space-y-1.5"><legend className="text-sm font-semibold">Redes que aparecem</legend>
            <div className="flex flex-wrap gap-2">
              {nets.map((n) => {
                const on = f.netKeys === null || f.netKeys.includes(n.key)
                return (
                  <label key={n.key} className={cn('flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold', on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
                    <input type="checkbox" className="h-4 w-4" checked={on} onChange={(e) => { const cur = f.netKeys ?? nets.map((x) => x.key); setF({ ...f, netKeys: e.target.checked ? [...cur, n.key] : cur.filter((k) => k !== n.key) }) }} /> {n.label}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">A pessoa escolhe a rede e digita só o usuário. A primeira marcada é a padrão. As redes e seus endereços ficam em <PageLink to="formularios/configuracoes/listas">Formulários → Listas</PageLink>.</p></fieldset>
        )}
        <div className="space-y-1.5"><Label htmlFor="fl-label" required>{asSection ? 'Nome da seção' : f.type === 'info' ? 'Título' : 'Pergunta'}</Label><Input id="fl-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        {f.type === 'info'
          ? <div className="space-y-1.5"><Label htmlFor="fl-desc">Texto</Label><RichTextarea id="fl-desc" rows={5} value={f.description} onChange={(v) => setF({ ...f, description: v })} extra={(insert) => <VarsHint onInsert={insert} valueVars={!!formRow.data?.cycle_id} />} /></div>
          : <div className="space-y-1.5"><Label htmlFor="fl-desc">Descrição</Label><Input id="fl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>}
        {needsOptions && (!f.mapping || f.mapping === 'member.custom') && (customLists.data ?? []).some((l) => !l.link) && (
          <div className="space-y-1.5"><Label htmlFor="fl-src">Fonte das opções</Label>
            <Select id="fl-src" value={listSource} onChange={(e) => { setListSource(e.target.value); setPicked(new Set()); autoPick.current = '' }}>
              <option value="">Digitar as opções aqui</option>
              {customLists.data!.filter((l) => !l.link).map((l) => <option key={l.id} value={l.id}>Lista: {l.name}</option>)}
            </Select>
          </div>
        )}
        {needsOptions && f.mapping === 'link.skill_level' && (customLists.data ?? []).some((l) => l.link === 'skill_level') && (
          <div className="space-y-1.5"><Label htmlFor="fl-levels">Lista de níveis</Label>
            <Select id="fl-levels" value={levelList} onChange={(e) => { setLevelList(e.target.value); setPicked(new Set()); autoLevel.current = '' }}>
              <option value="">Níveis (padrão)</option>
              {customLists.data!.filter((l) => l.link === 'skill_level').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
        )}
        {needsOptions && listMapped && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{src ? 'Itens da lista que aparecem' : f.mapping === 'link.instrument' ? 'Instrumentos que aparecem' : f.mapping === 'link.function' ? 'Categorias que aparecem' : f.mapping === 'sensitive.gender' ? 'Opções de gênero que aparecem' : f.mapping === 'sensitive.race_color' ? 'Opções de cor/raça que aparecem' : 'Níveis que aparecem'}</legend>
            {f.mapping === 'link.instrument' && (
              <div role="radiogroup" aria-label="Naipe" className="flex flex-wrap gap-2">
                {naipeList.map((n) => {
                  const marked = catalogItems.filter((i) => i.section_id === n.id && picked.has(i.id)).length
                  return (
                    <label key={n.id} className={cn('flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 font-semibold', activeNaipe === n.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
                      <input type="radio" name="fl-naipe" className="h-4 w-4" checked={activeNaipe === n.id} onChange={() => setNaipe(n.id)} />
                      {n.name}{marked > 0 && <span className="text-xs font-normal">({marked})</span>}
                    </label>
                  )
                })}
              </div>
            )}
            <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
              {shown.length === 0 && <p className="text-sm text-muted-foreground">Nada cadastrado aqui.</p>}
              {shown.map((i) => (
                <label key={i.id} className="flex min-h-9 items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={picked.has(i.id)} onChange={() => togglePicked(i.id)} />
                  <span>{i.name}</span>
                  {f.mapping === 'link.instrument' && fullIds.has(i.id) && <span className="rounded-full bg-destructive/10 px-2 text-xs font-semibold text-destructive">sem vagas{cycle ? ` em ${cycle.name}` : ''}</span>}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setShownPicked(true)}>Marcar todos</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShownPicked(false)}>Desmarcar todos</Button>
              <span className="text-xs text-muted-foreground">{plural(catalogItems.filter((i) => picked.has(i.id)).length, 'marcado: só ele aparece', 'marcados: só eles aparecem')} para a pessoa escolher.</span>
            </div>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5" checked={showDesc} onChange={(e) => setShowDesc(e.target.checked)} /> Mostrar a descrição de cada item</label>
            {showDesc && (
              <div className="space-y-2 rounded-lg border border-border bg-card p-2">
                <p className="text-xs text-muted-foreground">Vem do cadastro; editar aqui muda só esta pergunta. Em branco, o item aparece sem descrição.</p>
                {catalogItems.filter((i) => picked.has(i.id)).map((i) => (
                  <div key={i.id} className="space-y-1"><Label htmlFor={`fd-${i.id}`} className="text-xs">{i.name}</Label>
                    <Input id={`fd-${i.id}`} value={descs[i.id] ?? i.description ?? ''} onChange={(e) => setDescs({ ...descs, [i.id]: e.target.value })} /></div>
                ))}
              </div>
            )}
          </fieldset>
        )}
        {needsOptions && !listMapped && (
          <div className="space-y-1.5"><Label htmlFor="fl-opts">Opções (uma por linha)</Label>
            <textarea id="fl-opts" rows={5} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />
          </div>
        )}
        {needsOptions && !linkMapped && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={f.other} onChange={(e) => setF({ ...f, other: e.target.checked })} /> <span>Permitir “Outro”: aparece como última opção e abre um campo para a pessoa digitar.</span></label>
        )}
        {(f.type === 'number' || f.type === 'scale') && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="fl-min">Mínimo</Label><Input id="fl-min" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="fl-max">Máximo</Label><Input id="fl-max" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></div>
          </div>
        )}

        {<Card className="space-y-2 p-3">
          <p className="flex items-center gap-1.5 font-semibold"><GitBranch className="h-4 w-4" /> Mostrar somente se</p>
          <Select aria-label="Campo da condição" value={f.condField} onChange={(e) => setF({ ...f, condField: e.target.value, condValue: '' })}>
            <option value="">Sempre mostrar</option>
            <option value="_naipe">Naipe do integrante (formulário interno)</option>
            {!asSection && earlier.map((x) => <option key={x.id} value={x.field_key}>{x.label}</option>)}
          </Select>
          {f.condField && (
            <div className="grid grid-cols-2 gap-2">
              <Select aria-label="Operador" value={f.condOp} onChange={(e) => setF({ ...f, condOp: e.target.value as 'eq' | 'neq' })}><option value="eq">for igual a</option><option value="neq">for diferente de</option></Select>
              <Select aria-label="Valor" value={f.condValue} onChange={(e) => setF({ ...f, condValue: e.target.value })}>
                <option value="">Valor</option>{parentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          )}
        </Card>}

        <StickySave bleed={false}>
          <SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar campo" />
        </StickySave>
      </form>
    </SheetContent>
  )
}
