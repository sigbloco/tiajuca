import { requireFields } from '@/core/required'
import { promptBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Pencil, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DateInput, TimeInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Input, Label, Select, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDayLong, formatTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { ChecklistSection } from '@/modules/checklists/ChecklistSection'
import { ItineraryEditor, cleanSteps, loadSteps } from './ItineraryEditor'
import { useCycles } from '@/modules/cycles/service'
import { AudiencePicker, type AudRow } from './AudiencePicker'
import {
  COLOR_BADGE, COLOR_DOT, typeIdForColor, COLOR_LABEL, STATUS_LABEL, VISIBILITY_LABEL, getAudiences, saveActivity, setActivityStatus, cancelWord,
  type Activity, type ItineraryStep, type TypeColor,
} from './service'

interface Props {
  activity: Activity | null
  defaultDate: string
  onClose: () => void
  startEditing?: boolean
}

/** Detalhes + criação/edição de evento em drawer (mantém o contexto da agenda). */
export function EventSheet({ activity, defaultDate, onClose, startEditing }: Props) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  const canRecord = usePermission('attendance.record', 'group')
  const cycles = useCycles()

  const isNew = activity === null
  const [editing, setEditing] = useState(isNew || Boolean(startEditing))
  const [f, setF] = useState({
    title: activity?.title ?? '',
    color: (activity?.activity_types?.color ?? 'primary') as TypeColor,
    activity_date: activity?.activity_date ?? defaultDate,
    start_time: activity?.start_time?.slice(0, 5) ?? '',
    end_time: activity?.end_time?.slice(0, 5) ?? '',
    location: activity?.location ?? '',
    description: activity?.description ?? '',
    cycle_id: activity?.cycle_id ?? '',
    visibility: activity?.visibility ?? ('members' as Activity['visibility']),
  })
  // Ocorrência de recorrência: horário, local e descrição vêm do roteiro (como na recorrência), então esses campos não aparecem.
  const fromRule = Boolean(activity?.recurrence_rule_id)
  const [steps, setSteps] = useState<ItineraryStep[]>(() => (fromRule && !activity?.itinerary?.length && activity?.start_time
    ? loadSteps([{ time: activity.start_time, end: activity.end_time ?? undefined, label: activity.title, location: activity.location ?? undefined, description: activity.description ?? undefined }])
    : loadSteps(activity?.itinerary)))
  // Ciclo sempre definido: o que contém a data ou, na falta, o ciclo atual.
  useEffect(() => {
    if (f.cycle_id || !cycles.data) return
    const byDate = cycles.data.find((c) => c.is_active && c.starts_on <= f.activity_date && (!c.ends_on || f.activity_date <= c.ends_on))
    const pick = byDate ?? cycles.data.find((c) => c.is_current) ?? cycles.data.find((c) => c.is_active)
    if (pick) setF((x) => ({ ...x, cycle_id: pick.id }))
  }, [cycles.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [auds, setAuds] = useState<AudRow[]>([])
  const audience = useQuery({
    queryKey: ['audience', activity?.id],
    enabled: Boolean(activity) && canManage,
    queryFn: () => getAudiences(activity!.id),
  })
  useEffect(() => {
    if (audience.data) setAuds(audience.data.map((a) => ({ kind: a.kind, ref: a.ref_id })))
  }, [audience.data])

  const refresh = () => qc.invalidateQueries({ queryKey: ['activities', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      const typeId = await typeIdForColor(orgId, f.color)
      const items = cleanSteps(steps) ?? []
      const fromSteps = fromRule ? {
        start_time: items[0]?.time ?? null, end_time: items.map((x) => x.end ?? x.time).sort().pop() ?? null,
        location: items.find((x) => x.location)?.location ?? null, description: items.map((x) => x.description).filter(Boolean).join('\n') || null,
      } : null
      return saveActivity(orgId, activity?.id ?? null, {
        title: f.title.trim(),
        activity_type_id: typeId,
        activity_date: f.activity_date,
        start_time: fromSteps ? fromSteps.start_time : f.start_time || null,
        end_time: fromSteps ? fromSteps.end_time : f.end_time || null,
        location: fromSteps ? fromSteps.location : f.location.trim() || null,
        description: fromSteps ? fromSteps.description : f.description.trim() || null,
        cycle_id: f.cycle_id || null,
        visibility: f.visibility,
        itinerary: cleanSteps(steps),
      }, auds.filter((a) => a.ref).map((a) => ({ kind: a.kind, ref_id: a.ref })))
    },
    onSuccess: () => {
      toast.success(isNew ? 'Evento criado.' : 'Evento atualizado.')
      qc.invalidateQueries({ queryKey: ['audience'] })
      refresh()
      onClose()
    },
    onError: (e) => toast.error(/ends_at|check/i.test(String(e)) ? 'O horário final deve ser depois do inicial.' : friendlyError(e)),
  })
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  const changeStatus = useMutation({
    mutationFn: (v: { s: Activity['status']; reason?: string | null }) => setActivityStatus(orgId, activity!.id, v.s, v.reason),
    onSuccess: (_d, v) => { toast.success(v.s === 'cancelled' ? `${cap(cancelWord(activity?.activity_types?.name))} cancelad${cancelWord(activity?.activity_types?.name) === 'evento' ? 'o' : 'a'}.` : 'Atualizado.'); refresh(); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const time = activity ? [formatTime(activity.start_time), formatTime(activity.end_time)].filter(Boolean).join(' – ') : ''

  if (!editing && activity) {
    const t = activity.activity_types
    const theThing = `${cancelWord(t?.name) === 'evento' ? 'este' : 'esta'} ${cancelWord(t?.name)}`.replace('esta ensaio', 'este ensaio')
    return (
      <SheetContent title={activity.title} description={formatDayLong(activity.activity_date)}>
        <div className="flex flex-wrap items-center gap-2">
          {t && <Badge className={COLOR_BADGE[t.color]}>{t.name}</Badge>}
          <Badge>{STATUS_LABEL[activity.status]}</Badge>
          {activity.visibility === 'staff' && <Badge>{VISIBILITY_LABEL.staff}</Badge>}
        </div>
        <dl className="space-y-2">
          {time && <div><dt className="text-muted-foreground">Horário</dt><dd className="font-semibold">{time}</dd></div>}
          {activity.location && <div><dt className="text-muted-foreground">Local</dt><dd className="font-semibold">{activity.location}</dd></div>}
          {activity.description && <div><dt className="text-muted-foreground">Descrição</dt><dd className="whitespace-pre-wrap">{activity.description}</dd></div>}
        </dl>
        {activity.itinerary && activity.itinerary.length > 0 && (
          <section className="space-y-1">
            <h3>Roteiro</h3>
            <ol className="divide-y divide-border rounded-lg border border-border">
              {[...activity.itinerary].sort((a, b) => a.time.localeCompare(b.time)).map((x, i) => (
                <li key={i} className={cn('flex gap-3 px-3 py-2', i % 2 === 1 && 'bg-muted/50')}><span className="w-24 shrink-0 font-display font-bold">{x.time.slice(0, 5)}{x.end ? `–${x.end.slice(0, 5)}` : ''}</span><span className="min-w-0"><span className="font-semibold">{x.label}</span>{x.location && <span className="block text-muted-foreground">{x.location}</span>}{x.description && <span className="block whitespace-pre-wrap text-muted-foreground">{x.description}</span>}</span></li>
              ))}
            </ol>
          </section>
        )}
        <ChecklistSection activityId={activity.id} />
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex gap-2">
            {canRecord && activity.status !== 'cancelled' && (
              <Button asChild variant="outline" className="flex-1"><Link to={`/${membership?.slug}/presenca/${activity.id}`}><ClipboardCheck className="h-4 w-4" /> Presença</Link></Button>
            )}
            {canManage && <Button variant="outline" size="icon" aria-label="Editar" title="Editar" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>}
            {canManage && activity.status !== 'cancelled' && (
              <Button variant="outline" className="flex-1 text-destructive" disabled={changeStatus.isPending}
                onClick={async () => { const reason = await promptBox({ title: 'Cancelar', message: `Cancelar ${theThing}? Ele continua no histórico como cancelado.\nMotivo (ex.: chuva):`, confirmLabel: 'Cancelar o evento', cancelLabel: 'Voltar' }); if (reason !== null) changeStatus.mutate({ s: 'cancelled', reason }) }}>
                Cancelar {cancelWord(activity.activity_types?.name)}
              </Button>
            )}
          </div>
          {canManage && activity.status === 'cancelled' && (
            <Button variant="outline" onClick={() => changeStatus.mutate({ s: 'scheduled' })}>Reativar {cancelWord(activity.activity_types?.name)}</Button>
          )}
        </div>
      </SheetContent>
    )
  }

  return (
    <SheetContent title={isNew ? 'Novo evento' : 'Editar evento'} description="Data e horário no horário de Brasília.">
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([['Título', f.title.trim()], ['Data', f.activity_date], ['Ciclo', f.cycle_id], ['Público (escolha ou tire o item vazio)', !auds.some((a) => !a.ref)]])) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="ev-title" required>Título</Label><Input id="ev-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Cor no calendário</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor no calendário">
            {(Object.keys(COLOR_LABEL) as TypeColor[]).map((c) => (
              <button key={c} type="button" role="radio" aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} aria-checked={f.color === c} onClick={() => setF({ ...f, color: c })}
                className={cn('flex items-center rounded-full border p-2', f.color === c ? 'border-primary bg-muted ring-2 ring-primary' : 'border-border')}>
                <span className={cn('h-4 w-4 rounded-full', COLOR_DOT[c])} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ev-date" required>Data</Label><DateInput id="ev-date" required value={f.activity_date} onChange={(v) => setF({ ...f, activity_date: v })} /></div>
        {!fromRule && (
          <>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="ev-start">Início</Label><TimeInput id="ev-start" value={f.start_time} onChange={(v) => setF({ ...f, start_time: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-end">Fim</Label><TimeInput id="ev-end" value={f.end_time} onChange={(v) => setF({ ...f, end_time: v })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="ev-loc">Local</Label><Input id="ev-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-desc">Descrição</Label>
          <textarea id="ev-desc" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
          </>
        )}
        <ItineraryEditor steps={steps} onChange={setSteps} />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-cycle" required>Ciclo</Label>
            <Select id="ev-cycle" required value={f.cycle_id} onChange={(e) => setF({ ...f, cycle_id: e.target.value })}>
              {cycles.data?.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-vis">Quem vê</Label>
            <Select id="ev-vis" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Activity['visibility'] })}>
              {Object.entries(VISIBILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </div>
        <AudiencePicker value={auds} onChange={setAuds} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={save.isPending} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /> Salvar</Button>
          {!isNew && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Voltar</Button>}
        </div>
      </form>
    </SheetContent>
  )
}

export type { TypeColor }
