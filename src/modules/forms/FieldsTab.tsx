import { requireFields } from '@/core/required'
import { SaveButton } from '@/components/shared/SaveButton'
import { RichTextarea } from '@/components/shared/RichText'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { confirmBox } from '@/components/shared/DialogHost'
import { ArrowDown, ArrowUp, Ban, GitBranch, Layers, Plus, Trash2 } from 'lucide-react'
import { useHoldReorder } from '@/core/holdReorder'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { keyify, useFormFields, type FormFieldRow } from './service'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, isConsentBlock, isSection, type FieldOption, type FieldType } from './types'

const OPTION_TYPES: FieldType[] = ['single_select', 'multi_select']
const CATALOG_MAPPINGS = ['link.instrument', 'link.function']

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
    label: field?.label ?? '', description: field?.description ?? '', type: (asSection ? 'info' : field?.field_type ?? 'short_text') as FieldType, consent: !!field?.validation.consent, required: field?.required ?? false,
    options: (field?.options ?? []).map((o) => o.label).join('\n'),
    min: field?.validation.min?.toString() ?? '', max: field?.validation.max?.toString() ?? '', maxLength: field?.validation.maxLength?.toString() ?? '',
    condField: field?.condition?.field ?? '', condOp: field?.condition?.op ?? 'eq', condValue: field?.condition?.value ?? '',
    mapping: field?.member_mapping ?? '',
  })
  const sections = fields.filter(isSection)
  const currentSection = field ? sectionIds(fields).get(field.id) ?? '' : defaultSection ?? sections[sections.length - 1]?.id ?? ''
  const [sectionId, setSectionId] = useState(currentSection)
  const earlier = fields.filter((x) => x.is_active && x.field_type !== 'info' && x.id !== field?.id && (field ? x.sort_order < field.sort_order : true))
  const parent = earlier.find((x) => x.field_key === f.condField)
  const parentOptions: FieldOption[] = !parent ? [] : parent.field_type === 'yes_no' ? [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]
    : parent.field_type === 'checkbox' ? [{ value: 'true', label: 'Marcado' }, { value: 'false', label: 'Desmarcado' }] : parent.options

  // Mantém o valor interno de opções com o mesmo rótulo (respostas antigas seguem consistentes).
  const toOptions = (): FieldOption[] => {
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
      const validation = Object.fromEntries(Object.entries({ min: num(f.min), max: num(f.max), maxLength: num(f.maxLength) }).filter(([, v]) => v !== undefined && !Number.isNaN(v)))
      const opts = OPTION_TYPES.includes(f.type) && !CATALOG_MAPPINGS.includes(f.mapping) ? toOptions() : []
      // Seção e consentimento são campos "info" com uma marca em validation.
      const marks = asSection ? { section: true } : f.type === 'info' && f.consent ? { consent: true } : {}
      const row = {
        label: f.label.trim(), description: f.description.trim() || null, field_type: f.type, required: f.type === 'info' ? false : f.required, options: opts, validation: f.type === 'info' ? marks : validation,
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

  const needsOptions = OPTION_TYPES.includes(f.type) && !CATALOG_MAPPINGS.includes(f.mapping)
  return (
    <SheetContent title={asSection ? (field ? 'Editar seção' : 'Nova seção') : field ? 'Editar campo' : 'Novo campo'} description={asSection ? 'Agrupa as perguntas que vêm depois, até a próxima seção.' : field ? `Identificador: ${field.field_key}` : 'Pergunta ou bloco do formulário.'}>
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([[asSection ? 'Nome da seção' : 'Nome do campo', f.label.trim()], ['Opções', !needsOptions || f.options.trim()]])) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="fl-label" required>{asSection ? 'Nome da seção' : f.type === 'info' ? 'Título' : 'Pergunta'}</Label><Input id="fl-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        {f.type === 'info'
          ? <div className="space-y-1.5"><Label htmlFor="fl-desc">Texto</Label><RichTextarea id="fl-desc" rows={5} value={f.description} onChange={(v) => setF({ ...f, description: v })} /></div>
          : <div className="space-y-1.5"><Label htmlFor="fl-desc">Descrição</Label><Input id="fl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>}
        {!asSection && sections.length > 0 && (
          <div className="space-y-1.5"><Label htmlFor="fl-section">Seção</Label>
            <Select id="fl-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {currentSection === '' && <option value="">Sem seção</option>}
              {sections.map((x) => <option key={x.id} value={x.id}>{x.label}{x.is_active ? '' : ' (desativada)'}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">Ao trocar, o campo vai para o fim da seção escolhida.</p></div>
        )}
        {!asSection && <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="fl-type">Tipo</Label>
            <Select id="fl-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FieldType })}>
              {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
            </Select></div>
          {f.type !== 'info' && (
            <label className="mt-6 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Obrigatório</label>
          )}
        </div>}
        {f.type === 'info' && !asSection && (
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> <span>Bloco de consentimento: mostra o texto de privacidade do formulário e a caixa de marcar com o título acima. Sem este bloco, o consentimento fica no fim do formulário.</span></label>
        )}
        {needsOptions && (
          <div className="space-y-1.5"><Label htmlFor="fl-opts">Opções (uma por linha)</Label>
            <textarea id="fl-opts" rows={5} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></div>
        )}
        {OPTION_TYPES.includes(f.type) && CATALOG_MAPPINGS.includes(f.mapping) && <p className="text-xs text-muted-foreground">As opções vêm do cadastro (instrumentos/funções/níveis ativos) no momento da publicação.</p>}
        {(f.type === 'number' || f.type === 'scale') && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="fl-min">Mínimo</Label><Input id="fl-min" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="fl-max">Máximo</Label><Input id="fl-max" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></div>
          </div>
        )}
        {(f.type === 'short_text' || f.type === 'long_text') && (
          <div className="space-y-1.5"><Label htmlFor="fl-ml">Tamanho máximo (caracteres)</Label><Input id="fl-ml" inputMode="numeric" value={f.maxLength} onChange={(e) => setF({ ...f, maxLength: e.target.value.replace(/\D/g, '') })} /></div>
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

        {f.type !== 'info' && f.type !== 'file' && (
          <div className="space-y-1.5"><Label htmlFor="fl-map">Ligar ao cadastro do integrante</Label>
            <Select id="fl-map" value={f.mapping} onChange={(e) => setF({ ...f, mapping: e.target.value })}>
              <option value="">Não ligar (fica só no histórico da inscrição)</option>
              {Object.entries(MAPPING_LABEL).filter(([k]) => k !== 'link.skill_level' || f.mapping === k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">Ao aprovar, o valor vai direto para o cadastro, sem digitar de novo.</p></div>
        )}
        <SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar campo" />
      </form>
    </SheetContent>
  )
}

/** Construtor de campos: adicionar, ordenar, condições simples e ligação com o cadastro. */
export function FieldsTab({ formId }: { formId: string }) {
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
      <Button variant="add" className="w-full" onClick={() => setSheet({ field: null, section: true })}><Layers className="h-4 w-4" /> Nova seção</Button>
      {fields.length === 0 && <EmptyState>Nenhum campo ainda.</EmptyState>}
      <div className="grid gap-2">
        {fields.map((x, i) => {
          const sec = isSection(x)
          const nextIsHead = i === fields.length - 1 || isSection(fields[i + 1])
          const section = sectionIds(fields).get(x.id) ?? ''
          const hi = heads.findIndex((g) => g.head?.id === x.id)
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
                <button className="min-w-0 flex-1 basis-40 text-left" onClick={() => setSheet({ field: x, section: sec })}>
                  <p className={cn('break-words font-semibold', sec && 'font-display text-lg')}>{x.label}{x.required && <span className="text-destructive"> *</span>}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Badge>{sec ? 'Seção' : isConsentBlock(x) ? 'Consentimento' : FIELD_TYPE_LABEL[x.field_type]}</Badge>
                    {x.condition && <Badge className="bg-info/15 text-info">condicional</Badge>}
                    {x.member_mapping && <Badge className="bg-primary/10 text-primary">{MAPPING_LABEL[x.member_mapping]}</Badge>}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="outline" disabled={toggle.isPending} aria-label={x.is_active ? 'Ocultar' : 'Mostrar'} title={sec ? (x.is_active ? 'Oculta a seção e seus campos' : 'Mostra a seção e seus campos') : x.is_active ? 'Ocultar' : 'Mostrar'} onClick={() => toggle.mutate(x)}><Ban className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">{x.is_active ? 'Ocultar' : 'Mostrar'}</span></Button>
                  <Button size="sm" variant="outline" className="text-destructive" disabled={remove.isPending} aria-label="Apagar" title={sec ? 'Apaga a seção e seus campos' : 'Apagar'} onClick={() => askRemove(x)}><Trash2 className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Apagar</span></Button>
                </div>
              </Card>
              {nextIsHead && section !== '' && (
                <Button variant="add" className="ml-3" onClick={() => setSheet({ field: null, defaultSection: section })}><Plus className="h-4 w-4" /> Adicionar campo</Button>
              )}
            </div>
          )
        })}
        {heads.length === 0 && <Button variant="add" onClick={() => setSheet({ field: null })}><Plus className="h-4 w-4" /> Adicionar campo</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Mudanças nos campos só aparecem no link público depois de <strong>publicar de novo</strong>. Respostas antigas continuam legíveis.</p>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <FieldSheet key={sheet.field?.id ?? (sheet.section ? 'new-section' : `new-${sheet.defaultSection ?? ''}`)} asSection={sheet.section} defaultSection={sheet.defaultSection} formId={formId} field={sheet.field} fields={fields} nextOrder={fields.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
