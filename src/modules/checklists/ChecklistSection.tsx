import { confirmBox } from '@/components/shared/DialogHost'
import { Collapsible } from '@/components/shared/Collapsible'
import { SaveInput } from '@/components/shared/ConfirmField'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, CircleDot, MessageSquare, Trash2, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Select, cn } from '@/components/ui/primitives'
import { useHoldReorder } from '@/core/holdReorder'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { ITEM_STATUS_LABEL, NEXT_STATUS, listChecklist, progress, rpc } from './service'

const STATUS_ICON = { todo: Circle, doing: CircleDot, done: CheckCircle2 }

/**
 * Checklist do evento: cópia do modelo, recolhível, com o nome do modelo usado (o nome pode ser mudado em cada evento),
 * tarefas numeradas, status, responsável (membro real), observação e barra de progresso.
 */
export function ChecklistSection({ activityId }: { activityId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  const drag = useHoldReorder()
  const [expanded, setExpanded] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [template, setTemplate] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [assignee, setAssignee] = useState('')

  const items = useQuery({ queryKey: ['checklist', orgId, activityId], queryFn: () => listChecklist(activityId) })
  const nameQ = useQuery({
    queryKey: ['checklist-name', orgId, activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('checklist_name').eq('id', activityId).maybeSingle()
      if (error) throw error
      return ((data as { checklist_name: string | null } | null)?.checklist_name ?? null)
    },
  })
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
  const refreshName = () => qc.invalidateQueries({ queryKey: ['checklist-name', orgId, activityId] })
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const update = useMutation({ mutationFn: (a: Record<string, unknown>) => rpc('update_checklist_item', a), onSuccess: refresh, onError })
  const apply = useMutation({
    mutationFn: () => rpc('apply_checklist_template', { p_activity: activityId, p_template: template }),
    onSuccess: (n) => { toast.success(n ? `${n} tarefa(s) adicionada(s).` : 'Todas as tarefas do modelo já estão no evento.'); setExpanded(true); refresh(); refreshName() },
    onError,
  })
  const add = useMutation({ mutationFn: () => rpc('add_checklist_item', { p_activity: activityId, p_title: newTitle }), onSuccess: () => { setNewTitle(''); refresh() }, onError })
  const remove = useMutation({ mutationFn: (id: string) => rpc('remove_checklist_item', { p_item: id }), onSuccess: refresh, onError })
  const rename = useMutation({ mutationFn: (name: string) => rpc('set_checklist_name', { p_activity: activityId, p_name: name }), onSuccess: refreshName, onError })
  const reorder = useMutation({
    mutationFn: (ids: string[]) => rpc('reorder_checklist', { p_activity: activityId, p_ids: ids }),
    onSuccess: refresh,
    onError,
  })

  const list = items.data ?? []
  const p = progress(list)
  const swap = (a: number, b: number) => { const ids = list.map((i) => i.id); [ids[a], ids[b]] = [ids[b], ids[a]]; reorder.mutate(ids) }
  const moveTo = (fromId: string, toId: string) => {
    const ids = list.map((i) => i.id)
    const from = ids.indexOf(fromId), to = ids.indexOf(toId)
    if (from < 0 || to < 0 || from === to) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    reorder.mutate(ids)
  }

  if (!canManage && list.length === 0) return null
  const name = nameQ.data?.trim() || 'Checklist'
  return (
    // Enter nos campos daqui não pode enviar o formulário do evento em volta (a tela de edição); na nova tarefa, Enter adiciona.
    <section data-noguard onKeyDown={(e) => {
      if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
      e.preventDefault()
      if (e.target.placeholder === 'Nova tarefa' && newTitle.trim() && !add.isPending) add.mutate()
      else e.target.blur()
    }}>
      <Collapsible open={expanded} onToggle={() => setExpanded(!expanded)} title={name}
        right={<span className="shrink-0 text-sm font-semibold text-muted-foreground">{p.done}/{p.total} · {p.pct}%</span>}
        below={(
          <div className="h-2 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${name}`}>
            <div className="h-full bg-success transition-all" style={{ width: `${p.pct}%` }} />
          </div>
        )}>
        {canManage && (
          <div className="space-y-1 pb-1">
            <label className="text-xs font-semibold text-muted-foreground">Nome do checklist neste evento</label>
            <SaveInput className="[&_input]:w-full" aria-label="Nome do checklist neste evento" placeholder="Checklist" value={nameQ.data ?? ''} allowEmpty onSave={(v) => rename.mutateAsync(v)} />
          </div>
        )}
        {list.map((i, idx) => {
          const Icon = STATUS_ICON[i.status]
          const assigneeName = i.members ? (shortName(i.members?.full_name, i.members?.display_name)) : null
          return (
            <Card key={i.id} {...(canManage ? drag.row(i.id, moveTo, `checklist-${activityId}`) : {})} className={cn('space-y-1.5 p-2.5', drag.cls(i.id))}>
              <div className="flex items-start gap-2">
                {canManage && (
                  <div className="flex shrink-0 flex-col items-center">
                    <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Subir" disabled={idx === 0 || reorder.isPending} onClick={() => swap(idx, idx - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    {drag.handle(i.id, moveTo, `checklist-${activityId}`)}
                    <Button type="button" size="icon" variant="ghost" className="h-5 w-7" aria-label="Descer" disabled={idx === list.length - 1 || reorder.isPending} onClick={() => swap(idx, idx + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Status: ${ITEM_STATUS_LABEL[i.status]}. Tocar para avançar`}
                  disabled={update.isPending}
                  className={cn('mt-0.5 shrink-0', i.status === 'done' ? 'text-success' : i.status === 'doing' ? 'text-warning' : 'text-muted-foreground')}
                  onClick={() => update.mutate({ p_item: i.id, p_status: NEXT_STATUS[i.status] })}
                >
                  <Icon className="h-6 w-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('font-semibold', i.status === 'done' && 'text-muted-foreground line-through')}><span className="mr-1.5 text-primary">{idx + 1}.</span>{i.title}</p>
                  {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>{ITEM_STATUS_LABEL[i.status]}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5"><UserRound className="h-3 w-3" />{assigneeName ?? 'Sem responsável'}</span>
                  </p>
                </div>
                <Button type="button" size="icon" variant="ghost" aria-label="Observação" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  <MessageSquare className={cn('h-4 w-4', i.notes && 'text-primary')} />
                </Button>
                {canManage && (
                  <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={async () => { if (await confirmBox('Remover esta tarefa do evento?')) remove.mutate(i.id) }}><Trash2 className="h-4 w-4" /></Button>
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
                        <Button type="button" size="sm" disabled={!assignee} onClick={() => { update.mutate({ p_item: i.id, p_assignee: assignee, p_set_assignee: true }); setAssignFor(null); setAssignee('') }}>Definir</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setAssignFor(null)} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setAssignFor(i.id)}>Escolher responsável</Button>
                      {i.assignee_member_id && <Button type="button" size="sm" variant="ghost" onClick={() => update.mutate({ p_item: i.id, p_assignee: null, p_set_assignee: true })}>Remover responsável</Button>}
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
                <option value="">Usar modelo</option>
                {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Button type="button" size="sm" disabled={!template || apply.isPending} onClick={() => apply.mutate()}>Aplicar</Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Nova tarefa" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Button type="button" size="sm" disabled={!newTitle.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</Button>
            </div>
          </Card>
        )}
      </Collapsible>
    </section>
  )
}
