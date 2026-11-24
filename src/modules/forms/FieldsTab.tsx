import { plural } from '@/core/format'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { confirmBox } from '@/components/shared/DialogHost'
import { ArrowDown, ArrowUp, Ban, BookmarkPlus, CopyPlus, RotateCcw, LogIn, ChevronDown, ChevronRight, Layers, LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { promptBox } from '@/components/shared/DialogHost'
import { SendSection } from './SendSection'
import { useSectionTemplates } from './SectionTemplatesPage'
import { useHoldReorder } from '@/core/holdReorder'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useFormFields, type FormFieldRow } from './service'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, isLoginSection, isSection } from './types'
import { sectionIds, FieldSheet } from './FieldSheet'

/** Aviso dos campos que não puderam manter a ligação com o cadastro (com a concordância do número). */
const unlinkedText = (n: number) => n === 1
  ? '1 ficou sem ligação com o cadastro porque este formulário já usa essa ligação.'
  : `${n} ficaram sem ligação com o cadastro porque este formulário já usa essa ligação.`

/** Construtor de campos: adicionar, ordenar, condições simples e ligação com o cadastro. */
export function FieldsTab({ formId, templateMode, onOpenSend }: { formId: string; /** Abre a aba Envio (o card fixo "Envio" leva para lá). */ onOpenSend?: () => void; /** Editando uma seção modelo: só a seção do modelo (sem criar outras, sem apagar a seção). */ templateMode?: boolean }) {
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
      ? `Apagar a seção “${x.label}”${n > 0 ? (n === 1 ? ' e o campo dela' : ` e os ${n} campos dela`) : ''}? As versões já publicadas e as respostas não mudam.`
      : `Apagar o campo “${x.label}”? As versões já publicadas e as respostas não mudam.`
    if (await confirmBox(msg)) remove.mutate(x)
  }
  // Duplicar campo (logo abaixo dele) ou seção (com os campos dela, logo depois dela). A cópia não leva a ligação com o cadastro (cada ligação só pode existir uma vez no formulário).
  const duplicate = useMutation({
    mutationFn: async (x: FormFieldRow) => {
      const group = groupOf(x)
      const keyMap = new Map(group.map((y) => [y.field_key, `${y.field_key.replace(/_c[a-z0-9]{4}$/, '')}_c${Math.random().toString(36).slice(2, 6)}`]))
      const last = group[group.length - 1]
      const at = fields.findIndex((y) => y.id === last.id)
      const copies = group.map((y) => ({
        organization_id: orgId, form_id: formId, field_key: keyMap.get(y.field_key)!, label: y.id === x.id ? `${y.label} (cópia)` : y.label, description: y.description,
        field_type: y.field_type, required: y.required, options: y.options, default_value: y.default_value, validation: y.validation,
        condition: y.condition ? { ...y.condition, field: keyMap.get(y.condition.field) ?? y.condition.field } : null, member_mapping: null, is_active: y.is_active,
      }))
      const order = [...fields.slice(0, at + 1).map((y) => ({ id: y.id as string | null, sort_order: y.sort_order })), ...copies.map(() => ({ id: null as string | null, sort_order: 0 })), ...fields.slice(at + 1).map((y) => ({ id: y.id as string | null, sort_order: y.sort_order }))]
      // Abre espaço na ordem (de trás para a frente) e só então insere as cópias nos lugares livres.
      const shift = order.map((o, i) => ({ ...o, to: i + 1 })).filter((o) => o.id && o.to !== o.sort_order).reverse()
      for (const o of shift) { const r = await supabase.from('form_fields').update({ sort_order: o.to }).eq('id', o.id!); if (r.error) throw r.error }
      const { error } = await supabase.from('form_fields').insert(copies.map((c, i) => ({ ...c, sort_order: at + 2 + i })))
      if (error) throw error
    },
    onSuccess: (_, x) => { toast.success(isSection(x) ? 'Seção duplicada.' : 'Campo duplicado.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const resetFromTemplate = useMutation({
    mutationFn: async (sectionId: string) => { const { data, error } = await supabase.rpc('reset_section_from_template', { p_section: sectionId }); if (error) throw error; return data as { fields: number; unlinked: number } },
    onSuccess: (r) => { refresh(); toast.success(`Seção restaurada do modelo: ${plural(r.fields, 'campo', 'campos')}.${r.unlinked > 0 ? ` ${unlinkedText(r.unlinked)}` : ''}`) },
    onError: (e) => toast.error(friendlyError(e)),
  })
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
      toast.success(r.unlinked > 0 ? `Seção inserida com ${plural(r.fields, 'campo', 'campos')}. ${unlinkedText(r.unlinked)}` : `Seção inserida com ${plural(r.fields, 'campo', 'campos')}.`)
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
  // Editando um modelo há uma seção só: fica sempre aberta e não recolhe. Nos formulários, as seções começam recolhidas.
  const collapsed = { has: (id: string) => !templateMode && !opened.has(id) }
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
      {!templateMode && <div className="grid gap-2 sm:grid-cols-3 [&>*]:w-full">
        <Button variant="add" onClick={() => setSheet({ field: null, section: true })}><Layers className="h-4 w-4" /> Nova seção</Button>
        <Button variant="add" onClick={() => setPickOpen(true)}><LayoutTemplate className="h-4 w-4" /> Seção modelo</Button>
        <Button variant="add" disabled={hasLogin || addLogin.isPending} title={hasLogin ? 'Este formulário já tem uma seção de login' : 'Exige entrar com a conta Google; usa o e-mail da conta'} onClick={() => addLogin.mutate()}><LogIn className="h-4 w-4" /> Seção de login</Button>
      </div>}
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
                  <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Subir" disabled={sec ? hi <= 0 : i === 0}
                    onClick={() => (sec ? moveSection(x.id, heads[hi - 1].head!.id) : move.mutate({ from: i, to: i - 1 }))}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  {drag.handle(x.id, sec ? moveSection : moveFieldTo, sec ? 'sections' : 'fields')}
                  <Button size="icon" variant="ghost" className="h-9 w-11" aria-label="Descer" disabled={sec ? hi === heads.length - 1 : i === fields.length - 1}
                    onClick={() => (sec ? moveSection(x.id, heads[hi + 1].head!.id) : move.mutate({ from: i, to: i + 1 }))}><ArrowDown className="h-3.5 w-3.5" /></Button>
                </div>
                {sec && !templateMode && !isLoginSection(x) && (
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-expanded={!isClosed} aria-label={isClosed ? `Expandir ${x.label}` : `Recolher ${x.label}`} title={isClosed ? 'Expandir a seção' : 'Recolher a seção'} onClick={() => toggleCollapsed(x.id)}>
                    {isClosed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                )}
                <div className="min-w-0 flex-1 basis-40">
                <div className="flex items-start gap-2">
                  <button className="min-w-0 text-left" onClick={() => setSheet({ field: x, section: sec })}>
                    <p className={cn('break-words font-semibold', sec && 'font-display text-lg')}>{x.label}{x.required && <span className="text-destructive"> *</span>}</p>
                  </button>
                  {!isLoginSection(x) && !(templateMode && sec) && (
                    <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label={`Duplicar ${x.label}`} title={sec ? 'Duplicar a seção com os campos dela' : 'Duplicar o campo'} disabled={duplicate.isPending} onClick={() => duplicate.mutate(x)}><CopyPlus className="h-4 w-4" /></Button>
                  )}
                  {sec && !templateMode && x.source_template_id && (
                    <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label={`Restaurar ${x.label} do modelo`} title="Restaurar do modelo (os campos desta seção voltam ao modelo)" disabled={resetFromTemplate.isPending}
                      onClick={async () => { if (await confirmBox(`Restaurar a seção “${x.label}” como está no modelo? Os campos dela voltam ao modelo e o que você mudou aqui nela se perde. Respostas já enviadas não mudam.`)) resetFromTemplate.mutate(x.id) }}><RotateCcw className="h-4 w-4" /></Button>
                  )}
                </div>
                <button className="w-full text-left" onClick={() => setSheet({ field: x, section: sec })}>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Badge>{sec ? 'Seção' : FIELD_TYPE_LABEL[x.field_type]}</Badge>
                      {sec && !isLoginSection(x) && <Badge className="bg-muted text-muted-foreground">{count} {count === 1 ? 'campo' : 'campos'}</Badge>}
                      {isLoginSection(x) && <Badge className="bg-info/15 text-info">login com Google</Badge>}
                    {x.condition && <Badge className="bg-info/15 text-info">condicional</Badge>}
                    {x.member_mapping && <Badge className="bg-primary/10 text-primary">{MAPPING_LABEL[x.member_mapping]}</Badge>}
                  </p>
                </button>
                </div>
                <div className="flex w-full shrink-0 gap-1.5 [&>*]:flex-1 sm:w-auto sm:[&>*]:flex-none">
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
        {!templateMode && <SendSection onOpen={() => onOpenSend?.()} />}
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
                    <p className="text-sm text-muted-foreground">{t.count} {t.count === 1 ? 'campo' : 'campos'}</p>
                  </div>
                  <Button size="sm" disabled={insertTemplate.isPending} onClick={() => insertTemplate.mutate(t.id)}><Plus className="h-4 w-4" /> Adicionar</Button>
                </Card>
              ))}
            </div>
          </SheetContent>
        )}
      </Sheet>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <FieldSheet key={sheet.field?.id ?? (sheet.section ? 'new-section' : `new-${sheet.defaultSection ?? ''}`)} templateMode={templateMode} asSection={sheet.section} defaultSection={sheet.defaultSection} formId={formId} field={sheet.field} fields={fields} nextOrder={fields.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
