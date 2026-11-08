import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
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
import { ItineraryEditor, cleanSteps } from './ItineraryEditor'
import { useCycles } from '@/modules/cycles/service'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import type { CatalogTable } from '@/modules/structure/service'
import {
  COLOR_BADGE, COLOR_DOT, typeIdForColor, COLOR_LABEL, STATUS_LABEL, VISIBILITY_LABEL, getAudience, saveActivity, setActivityStatus,
  type Activity, type AudienceKind, type ItineraryStep, type TypeColor,
} from './service'

const AUDIENCE_TABLE: Record<AudienceKind, CatalogTable> = { section: 'sections', subsection: 'sections', instrument: 'instruments' }
const AUDIENCE_LABEL: Record<'section' | 'instrument', string> = { section: 'Naipe', instrument: 'Instrumento' }

interface Props {
  activity: Activity | null
  defaultDate: string
  onClose: () => void
}

/** Detalhes + criação/edição de evento em drawer (mantém o contexto da agenda). */
export function EventSheet({ activity, defaultDate, onClose }: Props) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  const canRecord = usePermission('attendance.record', 'group')
  const cycles = useCycles()

  const isNew = activity === null
  const [editing, setEditing] = useState(isNew)
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
  const [steps, setSteps] = useState<ItineraryStep[]>(() => (activity?.itinerary ?? []).map((x) => ({ time: x.time.slice(0, 5), label: x.label })))
  // Ciclo sempre definido: o que contém a data ou, na falta, o ciclo atual.
  useEffect(() => {
    if (f.cycle_id || !cycles.data) return
    const byDate = cycles.data.find((c) => c.is_active && c.starts_on <= f.activity_date && (!c.ends_on || f.activity_date <= c.ends_on))
    const pick = byDate ?? cycles.data.find((c) => c.is_current) ?? cycles.data.find((c) => c.is_active)
    if (pick) setF((x) => ({ ...x, cycle_id: pick.id }))
  }, [cycles.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [aKind, setAKind] = useState<AudienceKind | ''>('')
  const [aRef, setARef] = useState('')
  const audienceOptions = useCatalog(aKind ? AUDIENCE_TABLE[aKind] : 'sections')

  const audience = useQuery({
    queryKey: ['audience', activity?.id],
    enabled: Boolean(activity) && canManage,
    queryFn: () => getAudience(activity!.id),
  })
  useEffect(() => {
    if (audience.data) { setAKind(audience.data.kind); setARef(audience.data.ref_id) }
  }, [audience.data])

  const refresh = () => qc.invalidateQueries({ queryKey: ['activities', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      const typeId = await typeIdForColor(orgId, f.color)
      return saveActivity(orgId, activity?.id ?? null, {
        title: f.title.trim(),
        activity_type_id: typeId,
        activity_date: f.activity_date,
        start_time: f.start_time || null,
        end_time: f.end_time || null,
        location: f.location.trim() || null,
        description: f.description.trim() || null,
        cycle_id: f.cycle_id || null,
        visibility: f.visibility,
        itinerary: cleanSteps(steps),
      }, aKind && aRef ? { kind: aKind, ref_id: aRef } : null)
    },
    onSuccess: () => {
      toast.success(isNew ? 'Evento criado.' : 'Evento atualizado.')
      qc.invalidateQueries({ queryKey: ['audience'] })
      refresh()
      onClose()
    },
    onError: (e) => toast.error(/ends_at|check/i.test(String(e)) ? 'O horário final deve ser depois do inicial.' : friendlyError(e)),
  })
  const changeStatus = useMutation({
    mutationFn: (s: Activity['status']) => setActivityStatus(orgId, activity!.id, s),
    onSuccess: (_d, s) => { toast.success(s === 'cancelled' ? 'Evento cancelado.' : 'Evento atualizado.'); refresh(); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const valid = f.title.trim() && f.activity_date && f.cycle_id
  const time = activity ? [formatTime(activity.start_time), formatTime(activity.end_time)].filter(Boolean).join(' – ') : ''

  if (!editing && activity) {
    const t = activity.activity_types
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
                <li key={i} className={cn('flex gap-3 px-3 py-2', i % 2 === 1 && 'bg-muted/50')}><span className="w-12 shrink-0 font-display font-bold">{x.time.slice(0, 5)}</span><span>{x.label}</span></li>
              ))}
            </ol>
          </section>
        )}
        <ChecklistSection activityId={activity.id} />
        <div className="mt-auto flex flex-col gap-2">
          {canRecord && activity.status !== 'cancelled' && (
            <Button asChild><Link to={`/${membership?.slug}/presenca/${activity.id}`}><ClipboardCheck className="h-4 w-4" /> Abrir chamada</Link></Button>
          )}
          {canManage && <Button variant="outline" onClick={() => setEditing(true)}>Editar</Button>}
          {canManage && activity.status !== 'cancelled' && (
            <Button variant="ghost" className="text-destructive" disabled={changeStatus.isPending}
              onClick={() => { if (window.confirm('Cancelar este evento? Ele continuará no histórico como cancelado.')) changeStatus.mutate('cancelled') }}>
              Cancelar evento
            </Button>
          )}
          {canManage && activity.status === 'cancelled' && (
            <Button variant="outline" onClick={() => changeStatus.mutate('scheduled')}>Reativar evento</Button>
          )}
        </div>
      </SheetContent>
    )
  }

  return (
    <SheetContent title={isNew ? 'Novo evento' : 'Editar evento'} description="Data e horário no horário de Brasília.">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="ev-title">Título</Label><Input id="ev-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
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
        <div className="space-y-1.5"><Label htmlFor="ev-date">Data</Label><DateInput id="ev-date" required value={f.activity_date} onChange={(v) => setF({ ...f, activity_date: v })} /></div>
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
        <ItineraryEditor steps={steps} onChange={setSteps} />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-cycle">Ciclo</Label>
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
        <div className="space-y-1.5">
          <Label htmlFor="ev-aud">Público da chamada</Label>
          <div className="space-y-2">
            <Select id="ev-aud" value={aKind} onChange={(e) => { setAKind(e.target.value as AudienceKind | ''); setARef('') }}>
              <option value="">Todos os ativos no ciclo</option>
              {(Object.keys(AUDIENCE_LABEL) as ('section' | 'instrument')[]).map((k) => <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>)}
            </Select>
            <Select aria-label="Público" disabled={!aKind} value={aRef} onChange={(e) => setARef(e.target.value)}>
              <option value="">{aKind ? 'Selecione…' : '—'}</option>
              {aKind && audienceOptions.data?.filter((o) => o.is_active).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!valid || (Boolean(aKind) && !aRef) || save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
          {!isNew && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Voltar</Button>}
        </div>
      </form>
    </SheetContent>
  )
}

export type { TypeColor }
