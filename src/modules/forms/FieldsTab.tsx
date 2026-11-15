import { requireFields } from '@/core/required'
import { SaveButton } from '@/components/shared/SaveButton'
import { RichTextarea } from '@/components/shared/RichText'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmBox } from '@/components/shared/DialogHost'
import { ArrowDown, ArrowUp, Ban, BookmarkPlus, LogIn, ChevronDown, ChevronRight, GitBranch, Layers, LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { promptBox } from '@/components/shared/DialogHost'
import { SendSection } from './SendSection'
import { useSectionTemplates } from './SectionTemplatesPage'
import { useHoldReorder } from '@/core/holdReorder'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { keyify, useFormFields, type FormFieldRow } from './service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { SOCIAL_NETWORKS, parseNetworks } from '@/core/social'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, hasConsent, isLoginSection, isSection, type FieldOption, type FieldType } from './types'

const OPTION_TYPES: FieldType[] = ['single_select', 'multi_select']
/** Tipo escolhido no editor: os de sempre mais "Redes sociais" (texto longo com rede + usuário). */
type TypeChoice = FieldType | 'social'
const TYPE_LABEL: Record<TypeChoice, string> = { ...FIELD_TYPE_LABEL, social: 'Redes sociais' }

/** Seção (id do cabeçalho) em que cada campo está; "" = antes da primeira seção. */
function sectionIds(fields: FormFieldRow[]): Map<string, string> {
  const out = new Map<string, string>()
  let cur = ''
  for (const x of fields) { if (isSection(x)) cur = x.id; out.set(x.id, cur) }
  return out
}

/** Nova ordem dos campos depois de pôr `item` no fim da seção `sectionId` ("" = antes da primeira seção). */
function placeInSection(fields: FormFieldRow[], item: FormFieldRow, sectionId: string): FormFieldRow[] {
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

function FieldSheet({ formId, field, fields, nextOrder, onClose, asSection, defaultSection }: { asSection?: boolean; defaultSection?: string; formId: string; field: FormFieldRow | null; fields: FormFieldRow[]; nextOrder: number; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    label: field?.label ?? '', description: field?.description ?? '',
    type: (asSection ? 'info' : field?.field_type === 'long_text' && field.validation.social ? 'social' : field?.field_type ?? 'short_text') as TypeChoice,
    networks: (field?.validation.networks?.length ? SOCIAL_NETWORKS.filter((n) => field.validation.networks!.includes(n.key)) : SOCIAL_NETWORKS).map((n) => n.label).join(', '),
    other: !!field?.validation.other, consent: !!field?.validation.consent, required: field?.required ?? false,
    options: (field?.options ?? []).map((o) => o.label).join('\n'),
    min: field?.validation.min?.toString() ?? '', max: field?.validation.max?.toString() ?? '',
    condField: field?.condition?.field ?? '', condOp: field?.condition?.op ?? 'eq', condValue: field?.condition?.value ?? '',
    mapping: field?.member_mapping ?? '',
  })
  const sections = fields.filter((x) => isSection(x) && !isLoginSection(x))
  const instruments = useCatalog('instruments')
  const levels = useCatalog('skill_levels')
  const functions = useCatalog('artistic_functions')
  const genders = useCatalog('gender_options')
  const races = useCatalog('race_options')
  const naipes = useCatalog('sections')
  const { cycleId, cycle } = useSelectedCycle()
  const [naipe, setNaipe] = useState('')
  // Listas fixas do cadastro (instrumento, categoria, nível): o que estiver marcado aparece no formulário.
  const [picked, setPicked] = useState<Set<string>>(() => new Set((field?.options ?? []).map((o) => o.value)))
  const overview = useQuery({
    queryKey: ['form-instrument-vagas', orgId, cycleId],
    enabled: Boolean(cycleId) && f.mapping === 'link.instrument',
    queryFn: async () => {
      const { data, error } = await supabase.from('v_instrument_cycle_overview').select('instrument_id, instrument_name, section_id, is_full').eq('organization_id', orgId).eq('cycle_id', cycleId).order('section_order').order('instrument_order')
      if (error) throw error
      return (data ?? []) as { instrument_id: string; instrument_name: string; section_id: string; is_full: boolean }[]
    },
  })
  const linkMapped = f.mapping.startsWith('link.')
  // Listas do cadastro (marcar quais itens aparecem): instrumento, categoria, nível, gênero e cor/raça.
  const listMapped = linkMapped || f.mapping === 'sensitive.gender' || f.mapping === 'sensitive.race_color'
  const catalogItems = (f.mapping === 'link.instrument' ? instruments.data : f.mapping === 'link.skill_level' ? levels.data : f.mapping === 'link.function' ? functions.data : f.mapping === 'sensitive.gender' ? genders.data : f.mapping === 'sensitive.race_color' ? races.data : [])
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
  }, [catalogSig]) // eslint-disable-line react-hooks/exhaustive-deps
  const togglePicked = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setShownPicked = (on: boolean) => setPicked((cur) => { const n = new Set(cur); for (const i of shown) { if (on) n.add(i.id); else n.delete(i.id) } return n })
  const currentSection = field ? sectionIds(fields).get(field.id) ?? '' : defaultSection ?? sections[sections.length - 1]?.id ?? ''
  const [sectionId, setSectionId] = useState(currentSection)
  const earlier = fields.filter((x) => x.is_active && x.field_type !== 'info' && x.id !== field?.id && (field ? x.sort_order < field.sort_order : true))
  const parent = earlier.find((x) => x.field_key === f.condField)
  const parentOptions: FieldOption[] = !parent ? [] : parent.field_type === 'yes_no' ? [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]
    : parent.field_type === 'checkbox' ? [{ value: 'true', label: 'Marcado' }, { value: 'false', label: 'Desmarcado' }] : parent.options

  // Mantém o valor interno de opções com o mesmo rótulo (respostas antigas seguem consistentes).
  const toOptions = (): FieldOption[] => {
    // Listas do cadastro: só os marcados, na ordem do cadastro (o valor é o código do item, que liga ao integrante).
    // Instrumento, categoria e nível guardam o código do item (liga ao integrante); gênero e cor/raça guardam o próprio nome.
    if (listMapped) return catalogItems.filter((i) => picked.has(i.id)).map((i) => ({ value: linkMapped ? i.id : i.name, label: i.name }))
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
        const { keys, unknown } = parseNetworks(f.networks)
        if (unknown.length > 0) throw new Error(`Rede não reconhecida: ${unknown.join(', ')}. Use: ${SOCIAL_NETWORKS.map((n) => n.label).join(', ')}.`)
        if (keys.length === 0) throw new Error('Escolha ao menos uma rede.')
        if (keys.length < SOCIAL_NETWORKS.length) validation.networks = keys
      }
      if (f.other && OPTION_TYPES.includes(f.type as FieldType) && !f.mapping.startsWith('link.')) validation.other = true
      const opts = OPTION_TYPES.includes(f.type as FieldType) ? toOptions() : []
      // Seção e consentimento são campos "info" com uma marca em validation.
      const marks = asSection ? { section: true, ...(f.consent && !field?.validation.login ? { consent: true } : {}), ...(field?.validation.login ? { login: true } : {}) } : {}
      const row = {
        label: f.label.trim(), description: f.description.trim() || null, field_type: f.type === 'social' ? 'long_text' : f.type, required: f.type === 'info' ? false : f.required, options: opts, validation: f.type === 'info' ? marks : validation,
        condition: f.condField && f.condValue !== '' ? { field: f.condField, op: f.condOp, value: f.condValue } : null,
        member_mapping: f.mapping || null,
      }
      let id = field?.id ?? ''
      if (field) {
        const { error } = await supabase.from('form_fields').update(row).eq('id', field.id)
        if (error) throw error
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
    <SheetContent title={asSection ? (field ? 'Editar seção' : 'Nova seção') : field ? 'Editar campo' : 'Novo campo'} description={asSection ? 'Agrupa as perguntas que vêm depois, até a próxima seção.' : field ? `Identificador: ${field.field_key}` : 'Pergunta ou bloco do formulário.'}>
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([[asSection ? 'Nome da seção' : 'Nome do campo', f.label.trim()], ['Opções', !needsOptions || optionsOk]])) save.mutate() }} className="space-y-3">
        {!asSection && sections.length > 0 && (
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
          <div className="space-y-1.5"><Label htmlFor="fl-networks">Redes no menu</Label>
            <Input id="fl-networks" value={f.networks} onChange={(e) => setF({ ...f, networks: e.target.value })} />
            <p className="text-xs text-muted-foreground">Escreva as redes que vão aparecer para escolher, separadas por vírgula. Disponíveis: {SOCIAL_NETWORKS.map((n) => n.label).join(', ')}. A primeira é a padrão.</p></div>
        )}
        <div className="space-y-1.5"><Label htmlFor="fl-label" required>{asSection ? 'Nome da seção' : f.type === 'info' ? 'Título' : 'Pergunta'}</Label><Input id="fl-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        {f.type === 'info'
          ? <div className="space-y-1.5"><Label htmlFor="fl-desc">Texto</Label><RichTextarea id="fl-desc" rows={5} value={f.description} onChange={(v) => setF({ ...f, description: v })} /></div>
          : <div className="space-y-1.5"><Label htmlFor="fl-desc">Descrição</Label><Input id="fl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>}
        {asSection && !field?.validation.login && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> <span>Consentimento no fim desta seção: mostra o texto de privacidade (das configurações do formulário) e a caixa “Estou ciente e concordo”. Sem nenhuma seção com consentimento, ele fica no fim do formulário.</span></label>
        )}
        {needsOptions && listMapped && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{f.mapping === 'link.instrument' ? 'Instrumentos que aparecem' : f.mapping === 'link.function' ? 'Categorias que aparecem' : f.mapping === 'sensitive.gender' ? 'Opções de gênero que aparecem' : f.mapping === 'sensitive.race_color' ? 'Opções de cor/raça que aparecem' : 'Níveis que aparecem'}</legend>
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
              <span className="text-xs text-muted-foreground">{catalogItems.filter((i) => picked.has(i.id)).length} marcado(s): só eles aparecem para a pessoa escolher.</span>
            </div>
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

        {!asSection && <Card className="space-y-2 p-3">
          <p className="flex items-center gap-1.5 font-semibold"><GitBranch className="h-4 w-4" /> Mostrar somente se</p>
          <Select aria-label="Campo da condição" value={f.condField} onChange={(e) => setF({ ...f, condField: e.target.value, condValue: '' })}>
            <option value="">Sempre mostrar</option>
            {earlier.map((x) => <option key={x.id} value={x.field_key}>{x.label}</option>)}
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

        <SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar campo" />
      </form>
    </SheetContent>
  )
}

/** Construtor de campos: adicionar, ordenar, condições simples e ligação com o cadastro. */
export function FieldsTab({ formId, templateMode }: { formId: string; /** Editando uma seção modelo: só a seção do modelo (sem criar outras, sem apagar a seção). */ templateMode?: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data } = useFormFields(formId)
  const [sheet, setSheet] = useState<{ field: FormFieldRow | null; section?: boolean; defaultSection?: string } | null>(null)
  const fields = data ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['form-fields', orgId, formId] })
  // Desativar/ativar e apagar valem para o campo; numa seção, valem para ela e todos os campos dela.
  const groupOf = (x: FormFieldRow): FormFieldRow[] => {
    if (!isSection(x)) return [x]
    const where = sectionIds(fields)
    return fields.filter((y) => y.id === x.id || where.get(y.id) === x.id)
  }
  const toggle = useMutation({
    mutationFn: async (x: FormFieldRow) => {
      const on = !x.is_active
      const { error } = await supabase.from('form_fields').update({ is_active: on }).in('id', groupOf(x).map((y) => y.id))
      if (error) throw error
    },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (x: FormFieldRow) => {
      const gone = groupOf(x)
      const ids = gone.map((y) => y.id)
      // Perguntas que dependiam dos campos apagados deixam de ter condição (senão ficariam escondidas para sempre).
      const keys = new Set(gone.map((y) => y.field_key))
      const dependents = fields.filter((y) => !ids.includes(y.id) && y.condition && keys.has(y.condition.field))
      for (const d of dependents) { const r = await supabase.from('form_fields').update({ condition: null }).eq('id', d.id); if (r.error) throw r.error }
      const { error } = await supabase.from('form_fields').delete().in('id', ids)
      if (error) throw error
      // Fecha o buraco na ordem.
      const left = fields.filter((y) => !ids.includes(y.id))
      const r = await Promise.all(left.map((y, i) => (y.sort_order === i + 1 ? null : supabase.from('form_fields').update({ sort_order: i + 1 }).eq('id', y.id))))
      const bad = r.find((y) => y?.error); if (bad?.error) throw bad.error
    },
    onSuccess: () => { toast.success('Apagado.'); refresh() }, onError: (e) => toast.error(friendlyError(e)),
  })
  const askRemove = async (x: FormFieldRow) => {
    const n = groupOf(x).length - 1
    const msg = isSection(x)
      ? `Apagar a seção “${x.label}”${n > 0 ? ` e os ${n} campo(s) dela` : ''}? As versões já publicadas e as respostas não mudam.`
      : `Apagar o campo “${x.label}”? As versões já publicadas e as respostas não mudam.`
    if (await confirmBox(msg)) remove.mutate(x)
  }
  const drag = useHoldReorder()
  const hasLogin = fields.some(isLoginSection)
  const addLogin = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('form_fields').insert({
        organization_id: orgId, form_id: formId, field_key: `login_${Math.random().toString(36).slice(2, 8)}`, label: 'Login', description: 'Entre com sua conta Google para continuar. O e-mail da conta será usado na inscrição.',
        field_type: 'info', required: false, sort_order: fields.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1, validation: { section: true, login: true },
      })
      if (error) throw error
    },
    onSuccess: () => { refresh(); toast.success('Seção de login adicionada no fim. Mova-a para onde quiser.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const [pickOpen, setPickOpen] = useState(false)
  const templates = useSectionTemplates()
  const insertTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.rpc('insert_section_template', { p_form: formId, p_template: templateId })
      if (error) throw error
      return data as { fields: number; unlinked: number }
    },
    onSuccess: (r) => {
      refresh(); setPickOpen(false)
      toast.success(r.unlinked > 0 ? `Seção inserida com ${r.fields} pergunta(s). ${r.unlinked} ficaram sem ligação com o cadastro porque este formulário já usa essa ligação.` : `Seção inserida com ${r.fields} pergunta(s).`)
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const saveAsTemplate = useMutation({
    mutationFn: async (v: { id: string; name: string }) => { const { error } = await supabase.rpc('save_section_as_template', { p_section: v.id, p_name: v.name }); if (error) throw error },
    onSuccess: () => { toast.success('Modelo salvo em Formulários → Configurações → Seções modelo.'); qc.invalidateQueries({ queryKey: ['form-templates', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Seções recolhíveis na edição: por padrão todas recolhidas (só o cabeçalho, com a contagem de campos); a pessoa abre as que quer.
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const collapsed = { has: (id: string) => !opened.has(id) }
  const toggleCollapsed = (id: string) => setOpened((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const applyOrder = useMutation({
    mutationFn: async (order: FormFieldRow[]) => {
      const r = await Promise.all(order.map((x, i) => (x.sort_order === i + 1 ? null : supabase.from('form_fields').update({ sort_order: i + 1 }).eq('id', x.id))))
      const bad = r.find((y) => y?.error); if (bad?.error) throw bad.error
    },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
  // Seções são grupos: mover uma seção leva os campos dela junto. O grupo sem seção (campos antes da primeira) fica sempre no começo.
  const groups: { head: FormFieldRow | null; items: FormFieldRow[] }[] = []
  for (const x of fields) {
    if (isSection(x)) groups.push({ head: x, items: [] })
    else { if (groups.length === 0) groups.push({ head: null, items: [] }); groups[groups.length - 1].items.push(x) }
  }
  const heads = groups.filter((g) => g.head)
  const moveSection = (fromId: string, toId: string) => {
    const from = groups.findIndex((g) => g.head?.id === fromId), to = groups.findIndex((g) => g.head?.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const arr = [...groups]; const [g] = arr.splice(from, 1); arr.splice(to, 0, g)
    applyOrder.mutate(arr.flatMap((x) => [...(x.head ? [x.head] : []), ...x.items]))
  }
  const moveFieldTo = (fromId: string, toId: string) => {
    const arr = [...fields]
    const from = arr.findIndex((x) => x.id === fromId), to = arr.findIndex((x) => x.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const [x] = arr.splice(from, 1); arr.splice(to, 0, x)
    applyOrder.mutate(arr)
  }
  const move = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const arr = [...fields]; ;[arr[from], arr[to]] = [arr[to], arr[from]]
      const r = await Promise.all(arr.map((x, i) => (x.sort_order === i + 1 ? null : supabase.from('form_fields').update({ sort_order: i + 1 }).eq('id', x.id))))
      const bad = r.find((x) => x?.error); if (bad?.error) throw bad.error
    },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      {!templateMode && <ButtonRow>
        <Button variant="add" onClick={() => setSheet({ field: null, section: true })}><Layers className="h-4 w-4" /> Nova seção</Button>
        <Button variant="add" onClick={() => setPickOpen(true)}><LayoutTemplate className="h-4 w-4" /> Seção modelo</Button>
        <Button variant="add" disabled={hasLogin || addLogin.isPending} title={hasLogin ? 'Este formulário já tem uma seção de login' : 'Exige entrar com a conta Google; usa o e-mail da conta'} onClick={() => addLogin.mutate()}><LogIn className="h-4 w-4" /> Seção de login</Button>
      </ButtonRow>}
      {fields.length === 0 && <EmptyState>Nenhum campo ainda.</EmptyState>}
      <div className="grid gap-2">
        {fields.map((x, i) => {
          const sec = isSection(x)
          const nextIsHead = i === fields.length - 1 || isSection(fields[i + 1])
          const section = sectionIds(fields).get(x.id) ?? ''
          const hi = heads.findIndex((g) => g.head?.id === x.id)
          if (!sec && section !== '' && collapsed.has(section)) return null
          const isClosed = sec && collapsed.has(x.id)
          const count = sec ? (groups.find((g) => g.head?.id === x.id)?.items.length ?? 0) : 0
          return (
            <div key={x.id} className="grid gap-2">
              <Card {...drag.row(x.id, sec ? moveSection : moveFieldTo, sec ? 'sections' : 'fields')}
                className={cn('flex flex-wrap items-center gap-2 p-2.5', !x.is_active && 'opacity-60', sec ? 'border-l-4 border-l-primary bg-muted/60' : 'ml-3', drag.cls(x.id))}>
                <div className="flex flex-col items-center">
                  <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={sec ? hi <= 0 : i === 0}
                    onClick={() => (sec ? moveSection(x.id, heads[hi - 1].head!.id) : move.mutate({ from: i, to: i - 1 }))}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  {drag.handle(x.id, sec ? moveSection : moveFieldTo, sec ? 'sections' : 'fields')}
                  <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={sec ? hi === heads.length - 1 : i === fields.length - 1}
                    onClick={() => (sec ? moveSection(x.id, heads[hi + 1].head!.id) : move.mutate({ from: i, to: i + 1 }))}><ArrowDown className="h-3.5 w-3.5" /></Button>
                </div>
                {sec && !isLoginSection(x) && (
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-expanded={!isClosed} aria-label={isClosed ? `Expandir ${x.label}` : `Recolher ${x.label}`} title={isClosed ? 'Expandir a seção' : 'Recolher a seção'} onClick={() => toggleCollapsed(x.id)}>
                    {isClosed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                )}
                <button className="min-w-0 flex-1 basis-40 text-left" onClick={() => setSheet({ field: x, section: sec })}>
                  <p className={cn('break-words font-semibold', sec && 'font-display text-lg')}>{x.label}{x.required && <span className="text-destructive"> *</span>}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Badge>{sec ? 'Seção' : FIELD_TYPE_LABEL[x.field_type]}</Badge>
                      {sec && !isLoginSection(x) && <Badge className="bg-muted text-muted-foreground">{count} {count === 1 ? 'campo' : 'campos'}</Badge>}
                      {isLoginSection(x) && <Badge className="bg-info/15 text-info">login com Google</Badge>}
                    {hasConsent(x) && <Badge className="bg-success/15 text-success">consentimento</Badge>}
                    {x.condition && <Badge className="bg-info/15 text-info">condicional</Badge>}
                    {x.member_mapping && <Badge className="bg-primary/10 text-primary">{MAPPING_LABEL[x.member_mapping]}</Badge>}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1.5">
                  {sec && !templateMode && !isLoginSection(x) && (
                    <Button size="sm" variant="outline" disabled={saveAsTemplate.isPending} aria-label={`Salvar ${x.label} como modelo`} title="Salvar esta seção como modelo (com o mesmo nome, atualiza o modelo)"
                      onClick={async () => { const n = await promptBox({ title: 'Salvar como modelo', message: 'Nome do modelo:', initial: x.label, confirmLabel: 'Salvar' }); if (n && n.trim()) saveAsTemplate.mutate({ id: x.id, name: n.trim() }) }}><BookmarkPlus className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Modelo</span></Button>
                  )}
                  <Button size="sm" variant="outline" disabled={toggle.isPending} aria-label={x.is_active ? 'Ocultar' : 'Mostrar'} title={sec ? (x.is_active ? 'Oculta a seção e seus campos' : 'Mostra a seção e seus campos') : x.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => toggle.mutate(x)}><Ban className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">{x.is_active ? 'Ocultar' : 'Mostrar'}</span></Button>
                  {!(templateMode && sec) && <Button size="sm" variant="outline" className="text-destructive" disabled={remove.isPending} aria-label="Apagar" title={sec ? 'Apaga a seção e seus campos' : 'Apagar'} onClick={() => askRemove(x)}><Trash2 className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Apagar</span></Button>}
                </div>
              </Card>
              {nextIsHead && section !== '' && !isLoginSection(fields.find((y) => y.id === section) ?? x) && (
                <Button variant="add" className="ml-3" onClick={() => setSheet({ field: null, defaultSection: section })}><Plus className="h-4 w-4" /> Adicionar campo</Button>
              )}
            </div>
          )
        })}
        {heads.length === 0 && <Button variant="add" onClick={() => setSheet({ field: null })}><Plus className="h-4 w-4" /> Adicionar campo</Button>}
        {!templateMode && <SendSection formId={formId} />}
      </div>
      <p className="text-xs text-muted-foreground">Mudanças nos campos só aparecem no link público depois de <strong>publicar de novo</strong>. Respostas antigas continuam legíveis.</p>
      <Sheet open={pickOpen} onOpenChange={setPickOpen}>
        {pickOpen && (
          <SheetContent title="Seção modelo" description="Insere uma cópia no fim do formulário. Depois você pode mudar o que quiser.">
            <div className="space-y-2">
              {templates.isLoading && <Skeleton className="h-16" />}
              {templates.data?.length === 0 && <EmptyState>Nenhum modelo ainda. Use “Modelo” numa seção para criar o primeiro.</EmptyState>}
              {templates.data?.map((t) => (
                <Card key={t.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.count} {t.count === 1 ? 'pergunta' : 'perguntas'}</p>
                  </div>
                  <Button size="sm" disabled={insertTemplate.isPending} onClick={() => insertTemplate.mutate(t.id)}><Plus className="h-4 w-4" /> Adicionar</Button>
                </Card>
              ))}
            </div>
          </SheetContent>
        )}
      </Sheet>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <FieldSheet key={sheet.field?.id ?? (sheet.section ? 'new-section' : `new-${sheet.defaultSection ?? ''}`)} asSection={sheet.section} defaultSection={sheet.defaultSection} formId={formId} field={sheet.field} fields={fields} nextOrder={fields.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
