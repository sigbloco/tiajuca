import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, GitBranch, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { keyify, useFormFields, type FormFieldRow } from './service'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, type FieldOption, type FieldType } from './types'

const OPTION_TYPES: FieldType[] = ['single_select', 'multi_select']
const CATALOG_MAPPINGS = ['link.instrument', 'link.function', 'link.skill_level']

function FieldSheet({ formId, field, fields, nextOrder, onClose }: { formId: string; field: FormFieldRow | null; fields: FormFieldRow[]; nextOrder: number; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    label: field?.label ?? '', description: field?.description ?? '', type: (field?.field_type ?? 'short_text') as FieldType, required: field?.required ?? false,
    options: (field?.options ?? []).map((o) => o.label).join('\n'),
    min: field?.validation.min?.toString() ?? '', max: field?.validation.max?.toString() ?? '', maxLength: field?.validation.maxLength?.toString() ?? '',
    condField: field?.condition?.field ?? '', condOp: field?.condition?.op ?? 'eq', condValue: field?.condition?.value ?? '',
    mapping: field?.member_mapping ?? '',
  })
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
      const row = {
        label: f.label.trim(), description: f.description.trim() || null, field_type: f.type, required: f.type === 'info' ? false : f.required, options: opts, validation,
        condition: f.condField && f.condValue !== '' ? { field: f.condField, op: f.condOp, value: f.condValue } : null,
        member_mapping: f.mapping || null,
      }
      const q = field ? supabase.from('form_fields').update(row).eq('id', field.id)
        : supabase.from('form_fields').insert({ ...row, organization_id: orgId, form_id: formId, field_key: uniqueKey(), sort_order: nextOrder })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { toast.success('Campo salvo. Republique para valer no formulário público.'); qc.invalidateQueries({ queryKey: ['form-fields', orgId, formId] }); onClose() },
    onError: (e) => toast.error(/member_mapping|check/i.test(JSON.stringify(e)) ? 'Ligação com o cadastro inválida.' : friendlyError(e)),
  })
  const uniqueKey = () => { const base = keyify(f.label); let k = base, i = 2; const keys = new Set(fields.map((x) => x.field_key)); while (keys.has(k)) k = `${base.slice(0, 36)}_${i++}`; return k }

  const needsOptions = OPTION_TYPES.includes(f.type) && !CATALOG_MAPPINGS.includes(f.mapping)
  return (
    <SheetContent title={field ? 'Editar campo' : 'Novo campo'} description={field ? `Identificador: ${field.field_key}` : 'Pergunta ou bloco do formulário.'}>
      <form onSubmit={(e) => { e.preventDefault(); if (f.label.trim()) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="fl-label">{f.type === 'info' ? 'Texto' : 'Pergunta'}</Label><Input id="fl-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="fl-desc">Descrição (opcional)</Label><Input id="fl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="fl-type">Tipo</Label>
            <Select id="fl-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FieldType })}>
              {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
            </Select></div>
          {f.type !== 'info' && (
            <label className="mt-6 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Obrigatório</label>
          )}
        </div>
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

        <Card className="space-y-2 p-3">
          <p className="flex items-center gap-1.5 font-semibold"><GitBranch className="h-4 w-4" /> Mostrar somente se…</p>
          <Select aria-label="Campo da condição" value={f.condField} onChange={(e) => setF({ ...f, condField: e.target.value, condValue: '' })}>
            <option value="">Sempre mostrar</option>
            {earlier.map((x) => <option key={x.id} value={x.field_key}>{x.label}</option>)}
          </Select>
          {f.condField && (
            <div className="grid grid-cols-2 gap-2">
              <Select aria-label="Operador" value={f.condOp} onChange={(e) => setF({ ...f, condOp: e.target.value as 'eq' | 'neq' })}><option value="eq">for igual a</option><option value="neq">for diferente de</option></Select>
              <Select aria-label="Valor" value={f.condValue} onChange={(e) => setF({ ...f, condValue: e.target.value })}>
                <option value="">Valor…</option>{parentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          )}
        </Card>

        {f.type !== 'info' && f.type !== 'file' && (
          <div className="space-y-1.5"><Label htmlFor="fl-map">Ligar ao cadastro do integrante</Label>
            <Select id="fl-map" value={f.mapping} onChange={(e) => setF({ ...f, mapping: e.target.value })}>
              <option value="">Não ligar (fica só no histórico da inscrição)</option>
              {Object.entries(MAPPING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground">Ao aprovar, o valor vai direto para o cadastro, sem digitar de novo.</p></div>
        )}
        <Button type="submit" className="w-full" disabled={!f.label.trim() || save.isPending || (needsOptions && !f.options.trim())}>Salvar campo</Button>
      </form>
    </SheetContent>
  )
}

/** Construtor de campos: adicionar, ordenar, condições simples e ligação com o cadastro. */
export function FieldsTab({ formId }: { formId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data } = useFormFields(formId)
  const [sheet, setSheet] = useState<{ field: FormFieldRow | null } | null>(null)
  const fields = data ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['form-fields', orgId, formId] })
  const patch = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Partial<FormFieldRow> }) => { const { error } = await supabase.from('form_fields').update(p).eq('id', id); if (error) throw error },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
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
      <div className="flex items-center justify-between"><h2>Campos</h2><Button onClick={() => setSheet({ field: null })}><Plus className="h-4 w-4" /> Novo campo</Button></div>
      {fields.length === 0 && <EmptyState>Nenhum campo ainda.</EmptyState>}
      <div className="grid gap-2">
        {fields.map((x, i) => (
          <Card key={x.id} className={cn('flex items-center gap-2 p-2.5', !x.is_active && 'opacity-60')}>
            <div className="flex flex-col">
              <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={i === 0} onClick={() => move.mutate({ from: i, to: i - 1 })}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={i === fields.length - 1} onClick={() => move.mutate({ from: i, to: i + 1 })}><ArrowDown className="h-3.5 w-3.5" /></Button>
            </div>
            <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ field: x })}>
              <p className="truncate font-semibold">{x.label}{x.required && <span className="text-destructive"> *</span>}</p>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Badge>{FIELD_TYPE_LABEL[x.field_type]}</Badge>
                {x.condition && <Badge className="bg-info/15 text-info">condicional</Badge>}
                {x.member_mapping && <Badge className="bg-primary/10 text-primary">{MAPPING_LABEL[x.member_mapping]}</Badge>}
              </p>
            </button>
            <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: x.id, p: { is_active: !x.is_active } })}>{x.is_active ? 'Desativar' : 'Ativar'}</Button>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Mudanças nos campos só aparecem no link público depois de <strong>publicar de novo</strong>. Respostas antigas continuam legíveis.</p>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <FieldSheet key={sheet.field?.id ?? 'new'} formId={formId} field={sheet.field} fields={fields} nextOrder={fields.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
