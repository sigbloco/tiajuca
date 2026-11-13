import { requireFields } from '@/core/required'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { Collapsible } from '@/components/shared/Collapsible'
import { Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { WEEKDAYS, addDaysIso, formatDate, formatTime, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { AudiencePicker, type AudRow } from './AudiencePicker'
import { ItineraryEditor, cleanSteps, loadSteps } from './ItineraryEditor'
import { COLOR_DOT, COLOR_LABEL, VISIBILITY_LABEL, materialize, syncOccurrences, typeIdForColor, type ItineraryStep, type TypeColor } from './service'

interface Rule {
  id: string
  activity_type_id: string
  title: string
  weekday: number
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  visibility: 'members' | 'staff'
  starts_on: string
  until: string | null
  is_active: boolean
  itinerary: ItineraryStep[] | null
  audiences: { kind: 'section' | 'instrument' | 'category'; ref: string }[]
}

function RuleSheet({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const types = useCatalog('activity_types')
  const [f, setF] = useState({
    title: rule?.title ?? '',
    color: (types.data?.find((t) => t.id === rule?.activity_type_id)?.color ?? 'primary') as TypeColor,
    visibility: (rule?.visibility ?? 'members') as Rule['visibility'],
    weekday: String(rule?.weekday ?? 1),
    starts_on: rule?.starts_on ?? todayIso(membership?.timezone),
    until: rule?.until ?? '',
  })
  // Público da chamada: vários itens (ex.: Flauta e Sax alto). Vazio = todos os ativos no ciclo.
  const [auds, setAuds] = useState<AudRow[]>(rule?.audiences ?? [])
  // Recorrência antiga, sem roteiro: o horário, o local e a descrição dela viram o primeiro item.
  const [steps, setSteps] = useState<ItineraryStep[]>(() => (rule?.itinerary?.length || !rule?.start_time
    ? loadSteps(rule?.itinerary)
    : loadSteps([{ time: rule.start_time, end: rule.end_time ?? undefined, label: rule.title, location: rule.location ?? undefined, description: rule.description ?? undefined }])))
  const save = useMutation({
    mutationFn: async () => {
      const items = cleanSteps(steps)
      const row = {
        title: f.title.trim(), activity_type_id: await typeIdForColor(orgId, f.color), visibility: f.visibility, weekday: Number(f.weekday),
        // Horário, local e descrição do evento vêm do roteiro: começa no primeiro item e termina no último fim.
        start_time: items[0]?.time ?? null, end_time: items.map((x) => x.end ?? x.time).sort().pop() ?? null,
        location: items.find((x) => x.location)?.location ?? null, description: items.map((x) => x.description).filter(Boolean).join('\n') || null,
        starts_on: f.starts_on, until: f.until || null, itinerary: items,
        audiences: auds.filter((a) => a.ref).map((a) => ({ kind: a.kind, ref: a.ref })),
      }
      const q = rule
        ? supabase.from('recurrence_rules').update(row).eq('id', rule.id)
        : supabase.from('recurrence_rules').insert({ ...row, organization_id: orgId })
      const { error } = await q
      if (error) throw error
      // Gera já as próximas datas no calendário (12 semanas), sem esperar reabrir a página.
      await materialize(orgId, addDaysIso(todayIso(membership?.timezone), 84))
      if (rule) await syncOccurrences(orgId, todayIso(membership?.timezone), rule.id)
    },
    onSuccess: () => {
      toast.success('Recorrência salva. As próximas datas foram atualizadas.')
      qc.invalidateQueries({ queryKey: ['activities', orgId] })
      qc.invalidateQueries({ queryKey: ['rules', orgId] })
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={rule ? 'Editar recorrência' : 'Nova recorrência'} description="Gera um evento toda semana no dia escolhido. Ao salvar, as próximas datas já geradas são atualizadas; as passadas não mudam.">
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([['Título', f.title.trim()], ['A partir de', f.starts_on], ['Público (escolha ou tire o item vazio)', !auds.some((a) => !a.ref)]])) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="r-title" required>Título</Label><Input id="r-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
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
        <div className="space-y-1.5">
          <Label htmlFor="r-day">Dia da semana</Label>
          <Select id="r-day" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Select>
        </div>
        <ItineraryEditor steps={steps} onChange={setSteps} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="r-from" required>A partir de</Label><DateInput id="r-from" required value={f.starts_on} onChange={(v) => setF({ ...f, starts_on: v })} /></div>
            <div className="space-y-1.5"><Label htmlFor="r-until">Até</Label><DateInput id="r-until" min={f.starts_on || undefined} value={f.until} onChange={(v) => setF({ ...f, until: v })} /></div>
          </div>
          <AudiencePicker value={auds} onChange={setAuds} />
          <div className="space-y-1.5">
            <Label htmlFor="r-vis">Quem vê</Label>
            <Select id="r-vis" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Rule['visibility'] })}>
              {Object.entries(VISIBILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={save.isPending} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /> Salvar</Button>
      </form>
    </SheetContent>
  )
}

/** Recorrências semanais (ex.: "Ensaio – toda segunda-feira"). A Direção edita ou encerra sem mexer em código. */
export function RecurrencesSettings() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [sheet, setSheet] = useState<{ rule: Rule | null } | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['rules', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('recurrence_rules').select('*').eq('organization_id', orgId).order('created_at')
      if (error) throw error
      return (data ?? []) as Rule[]
    },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['rules', orgId] }); qc.invalidateQueries({ queryKey: ['activities', orgId] }) }

  const generate = useMutation({
    mutationFn: async () => {
      const created = await materialize(orgId, addDaysIso(todayIso(membership?.timezone), 84))
      const updated = await syncOccurrences(orgId, todayIso(membership?.timezone))
      return { created, updated }
    },
    onSuccess: ({ created, updated }) => { toast.success(`${created} evento(s) gerado(s); ${updated} próximo(s) atualizado(s) conforme a recorrência.`); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('end_recurrence', { p_rule: id })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => { toast.success(`Recorrência na lixeira. ${n} evento(s) futuro(s) cancelado(s).`); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurrence_rules').update({ is_active: true, until: null }).eq('id', id)
      if (error) throw error
      const { error: e2 } = await supabase.from('activities').update({ status: 'scheduled' }).eq('recurrence_rule_id', id).eq('status', 'cancelled').gt('activity_date', todayIso(membership?.timezone))
      if (e2) throw e2
      return materialize(orgId, addDaysIso(todayIso(membership?.timezone), 84))
    },
    onSuccess: () => { toast.success('Recorrência restaurada.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_recurrence', { p_rule: id })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => { toast.success(`Recorrência apagada de vez. ${n} evento(s) removido(s).`); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const summary = (r: Rule) => WEEKDAYS[r.weekday] + (r.start_time ? ' · ' + formatTime(r.start_time) + (r.end_time ? '–' + formatTime(r.end_time) : '') : '') + (r.location ? ' · ' + r.location : '') + ' · desde ' + formatDate(r.starts_on) + (r.until ? ' até ' + formatDate(r.until) : '')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Recorrências</h2>
        <div className="flex gap-2">
          <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>Atualizar próximas datas</Button>
          <Button variant="add" onClick={() => setSheet({ rule: null })}><Plus className="h-4 w-4" /> Nova</Button>
        </div>
      </div>
      <p className="text-muted-foreground">As próximas 12 semanas são geradas automaticamente quando a Direção abre a agenda.</p>
      {data?.filter((r) => r.is_active).length === 0 && <EmptyState>Nenhuma recorrência.</EmptyState>}
      <div className="grid gap-2">
        {data?.filter((r) => r.is_active).map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{r.title}</p>
              <p className="text-muted-foreground">{summary(r)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" aria-label={'Editar ' + r.title} title="Editar" onClick={() => setSheet({ rule: r })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={'Apagar ' + r.title} title="Apagar (vai para a lixeira)" disabled={end.isPending} onClick={() => end.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <Collapsible open={trashOpen} onToggle={() => setTrashOpen((o) => !o)} tone="muted" title="Lixeira" count={data?.filter((r) => !r.is_active).length ?? 0}>
        {data?.filter((r) => !r.is_active).length === 0 && <p className="px-1 text-muted-foreground">A lixeira está vazia.</p>}
        {data?.filter((r) => !r.is_active).map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{r.title}</p>
              <p className="text-muted-foreground">{summary(r)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" aria-label={'Restaurar ' + r.title} title="Restaurar" disabled={reactivate.isPending} onClick={() => reactivate.mutate(r.id)}><Undo2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={'Apagar ' + r.title + ' de vez'} title="Apagar de vez" disabled={remove.isPending}
                onClick={async () => { if (await confirmBox('Apagar de vez esta recorrência e os eventos gerados por ela? Isso não pode ser desfeito. Eventos com presença registrada são mantidos no histórico.')) remove.mutate(r.id) }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </Collapsible>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <RuleSheet key={sheet.rule?.id ?? 'new'} rule={sheet.rule} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
