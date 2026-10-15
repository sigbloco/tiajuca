import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, CircleDot, MessageSquare, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Select, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { ITEM_STATUS_LABEL, NEXT_STATUS, listChecklist, progress, rpc } from './service'

const STATUS_ICON = { todo: Circle, doing: CircleDot, done: CheckCircle2 }

/** Checklist do evento: cópia do modelo, com status, responsável (membro real), observação e barra de progresso. */
export function ChecklistSection({ activityId }: { activityId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  const [newTitle, setNewTitle] = useState('')
  const [template, setTemplate] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [assignee, setAssignee] = useState('')

  const items = useQuery({ queryKey: ['checklist', orgId, activityId], queryFn: () => listChecklist(activityId) })
  const templates = useQuery({
    queryKey: ['checklist-templates', orgId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_templates').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['checklist', orgId, activityId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const update = useMutation({ mutationFn: (a: Record<string, unknown>) => rpc('update_checklist_item', a), onSuccess: refresh, onError })
  const apply = useMutation({
    mutationFn: () => rpc('apply_checklist_template', { p_activity: activityId, p_template: template }),
    onSuccess: (n) => { toast.success(n ? `${n} tarefa(s) adicionada(s).` : 'Todas as tarefas do modelo já estão no evento.'); refresh() },
    onError,
  })
  const add = useMutation({ mutationFn: () => rpc('add_checklist_item', { p_activity: activityId, p_title: newTitle }), onSuccess: () => { setNewTitle(''); refresh() }, onError })
  const remove = useMutation({ mutationFn: (id: string) => rpc('remove_checklist_item', { p_item: id }), onSuccess: refresh, onError })
  const reorder = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) => {
      const ids = (items.data ?? []).map((i) => i.id)
      ;[ids[from], ids[to]] = [ids[to], ids[from]]
      return rpc('reorder_checklist', { p_activity: activityId, p_ids: ids })
    },
    onSuccess: refresh,
    onError,
  })

  const list = items.data ?? []
  const p = progress(list)

  if (!canManage && list.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between"><h3>Checklist</h3><span className="text-muted-foreground">{p.done}/{p.total} · {p.pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-success transition-all" style={{ width: `${p.pct}%` }} />
      </div>

      {list.map((i, idx) => {
        const Icon = STATUS_ICON[i.status]
        const assigneeName = i.members ? (i.members.display_name ?? i.members.full_name) : null
        return (
          <Card key={i.id} className="space-y-1.5 p-2.5">
            <div className="flex items-start gap-2">
              <button
                aria-label={`Status: ${ITEM_STATUS_LABEL[i.status]}. Tocar para avançar`}
                disabled={update.isPending}
                className={cn('mt-0.5 shrink-0', i.status === 'done' ? 'text-success' : i.status === 'doing' ? 'text-warning' : 'text-muted-foreground')}
                onClick={() => update.mutate({ p_item: i.id, p_status: NEXT_STATUS[i.status] })}
              >
                <Icon className="h-6 w-6" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn('font-semibold', i.status === 'done' && 'text-muted-foreground line-through')}>{i.title}</p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{ITEM_STATUS_LABEL[i.status]}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><UserRound className="h-3 w-3" />{assigneeName ?? 'Sem responsável'}</span>
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label="Observação" onClick={() => setOpen(open === i.id ? null : i.id)}>
                <MessageSquare className={cn('h-4 w-4', i.notes && 'text-primary')} />
              </Button>
              {canManage && (
                <div className="flex">
                  <Button size="icon" variant="ghost" aria-label="Subir" disabled={idx === 0} onClick={() => reorder.mutate({ from: idx, to: idx - 1 })}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Descer" disabled={idx === list.length - 1} onClick={() => reorder.mutate({ from: idx, to: idx + 1 })}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => { if (window.confirm('Remover esta tarefa do evento?')) remove.mutate(i.id) }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
            {open === i.id && (
              <div className="space-y-2 pl-8">
                <Input placeholder="Observação" defaultValue={i.notes ?? ''}
                  onBlur={(e) => { if (e.target.value !== (i.notes ?? '')) update.mutate({ p_item: i.id, p_notes: e.target.value }) }} />
                {canManage && (assignFor === i.id ? (
                  <div className="space-y-1.5">
                    <MemberPicker value={assignee} onChange={setAssignee} />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!assignee} onClick={() => { update.mutate({ p_item: i.id, p_assignee: assignee, p_set_assignee: true }); setAssignFor(null); setAssignee('') }}>Definir</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssignFor(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAssignFor(i.id)}>Escolher responsável</Button>
                    {i.assignee_member_id && <Button size="sm" variant="ghost" onClick={() => update.mutate({ p_item: i.id, p_assignee: null, p_set_assignee: true })}>Remover responsável</Button>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}

      {canManage && (
        <Card className="space-y-2 p-3">
          <div className="flex gap-2">
            <Select aria-label="Modelo de checklist" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Usar modelo…</option>
              {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Button size="sm" disabled={!template || apply.isPending} onClick={() => apply.mutate()}>Aplicar</Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Nova tarefa" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Button size="sm" disabled={!newTitle.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</Button>
          </div>
        </Card>
      )}
    </section>
  )
}
