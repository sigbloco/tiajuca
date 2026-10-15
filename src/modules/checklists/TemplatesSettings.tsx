import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { Button, Card, EmptyState, Input, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import type { Template, TemplateItem } from './service'

/** Modelos de checklist (ex.: "Apresentação / Cortejo"). Editar o modelo não altera eventos que já copiaram as tarefas. */
export function TemplatesSettings({ canEdit }: { canEdit: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [newTemplate, setNewTemplate] = useState('')
  const [newItem, setNewItem] = useState<Record<string, string>>({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['tpl', orgId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const templates = useQuery({
    queryKey: ['tpl', orgId, 'templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_templates').select('id, name, is_active').eq('organization_id', orgId).order('name')
      if (error) throw error
      return (data ?? []) as Template[]
    },
  })
  const items = useQuery({
    queryKey: ['tpl', orgId, 'items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_template_items').select('id, template_id, title, sort_order, is_active').eq('organization_id', orgId).order('sort_order')
      if (error) throw error
      return (data ?? []) as TemplateItem[]
    },
  })

  const addTemplate = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('checklist_templates').insert({ organization_id: orgId, name: newTemplate.trim() }); if (error) throw error },
    onSuccess: () => { setNewTemplate(''); refresh() }, onError,
  })
  const patchTemplate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Template> }) => { const { error } = await supabase.from('checklist_templates').update(patch).eq('id', id); if (error) throw error },
    onSuccess: refresh, onError,
  })
  const addItem = useMutation({
    mutationFn: async ({ templateId, title }: { templateId: string; title: string }) => {
      const max = (items.data ?? []).filter((i) => i.template_id === templateId).reduce((m, i) => Math.max(m, i.sort_order), 0)
      const { error } = await supabase.from('checklist_template_items').insert({ organization_id: orgId, template_id: templateId, title, sort_order: max + 1 })
      if (error) throw error
    },
    onSuccess: (_d, v) => { setNewItem((m) => ({ ...m, [v.templateId]: '' })); refresh() }, onError,
  })
  const patchItem = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TemplateItem> }) => { const { error } = await supabase.from('checklist_template_items').update(patch).eq('id', id); if (error) throw error },
    onSuccess: refresh, onError,
  })
  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: TemplateItem; b: TemplateItem }) => {
      const r = await Promise.all([
        supabase.from('checklist_template_items').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('checklist_template_items').update({ sort_order: a.sort_order }).eq('id', b.id),
      ])
      if (r[0].error || r[1].error) throw r[0].error ?? r[1].error
    },
    onSuccess: refresh, onError,
  })
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="space-y-3">
      <h2>Modelos de checklist</h2>
      <p className="text-muted-foreground">Ao usar um modelo num evento, as tarefas são copiadas para ele. Depois, cada evento pode ter tarefas próprias.</p>
      {canEdit && (
        <Card className="flex gap-2 p-3">
          <Input placeholder="Novo modelo" value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} />
          <Button disabled={!newTemplate.trim() || addTemplate.isPending} onClick={() => addTemplate.mutate()}><Plus className="h-4 w-4" /> Criar</Button>
        </Card>
      )}
      {templates.data?.length === 0 && <EmptyState>Nenhum modelo.</EmptyState>}
      <div className="space-y-2">
        {templates.data?.map((t) => {
          const list = (items.data ?? []).filter((i) => i.template_id === t.id)
          return (
            <Collapsible key={t.id} open={open.has(t.id)} onToggle={() => toggle(t.id)} title={<span className={cn(!t.is_active && 'opacity-60')}>{t.name}</span>} count={list.filter((i) => i.is_active).length}
              right={canEdit ? <Button size="sm" variant="outline" onClick={() => patchTemplate.mutate({ id: t.id, patch: { is_active: !t.is_active } })}>{t.is_active ? 'Desativar' : 'Ativar'}</Button> : undefined}>
              {list.map((i, idx) => (
                <div key={i.id} className={cn('flex items-center gap-1.5 rounded-lg bg-background p-1.5', !i.is_active && 'opacity-60')}>
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={!canEdit || idx === 0} onClick={() => swap.mutate({ a: i, b: list[idx - 1] })}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={!canEdit || idx === list.length - 1} onClick={() => swap.mutate({ a: i, b: list[idx + 1] })}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Input className="h-9 flex-1 border-transparent bg-transparent font-semibold" defaultValue={i.title} disabled={!canEdit}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.title) patchItem.mutate({ id: i.id, patch: { title: v } }); else e.target.value = i.title }} />
                  {canEdit && <Button size="sm" variant="outline" onClick={() => patchItem.mutate({ id: i.id, patch: { is_active: !i.is_active } })}>{i.is_active ? 'Remover' : 'Restaurar'}</Button>}
                </div>
              ))}
              {canEdit && (
                <div className="flex gap-2">
                  <Input placeholder="Nova tarefa do modelo" value={newItem[t.id] ?? ''} onChange={(e) => setNewItem({ ...newItem, [t.id]: e.target.value })} />
                  <Button size="sm" disabled={!(newItem[t.id] ?? '').trim() || addItem.isPending} onClick={() => addItem.mutate({ templateId: t.id, title: (newItem[t.id] ?? '').trim() })}><Plus className="h-4 w-4" /> Tarefa</Button>
                </div>
              )}
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
