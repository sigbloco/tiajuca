import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput, TimeInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { WEEKDAYS, addDaysIso, formatDate, formatTime, todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { materialize } from './service'

interface Rule {
  id: string
  activity_type_id: string
  title: string
  weekday: number
  start_time: string | null
  end_time: string | null
  location: string | null
  starts_on: string
  until: string | null
  is_active: boolean
}

function RuleSheet({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const types = useCatalog('activity_types')
  const [f, setF] = useState({
    title: rule?.title ?? '',
    activity_type_id: rule?.activity_type_id ?? '',
    weekday: String(rule?.weekday ?? 1),
    start_time: rule?.start_time?.slice(0, 5) ?? '',
    end_time: rule?.end_time?.slice(0, 5) ?? '',
    location: rule?.location ?? '',
    starts_on: rule?.starts_on ?? todayIso(membership?.timezone),
    until: rule?.until ?? '',
  })
  const save = useMutation({
    mutationFn: async () => {
      const row = {
        title: f.title.trim(), activity_type_id: f.activity_type_id, weekday: Number(f.weekday),
        start_time: f.start_time || null, end_time: f.end_time || null, location: f.location.trim() || null,
        starts_on: f.starts_on, until: f.until || null,
      }
      const q = rule
        ? supabase.from('recurrence_rules').update(row).eq('id', rule.id)
        : supabase.from('recurrence_rules').insert({ ...row, organization_id: orgId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Recorrência salva. Novas datas serão geradas na agenda.')
      qc.invalidateQueries({ queryKey: ['rules', orgId] })
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={rule ? 'Editar recorrência' : 'Nova recorrência'} description="Gera um evento toda semana no dia escolhido. Eventos já criados não mudam.">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="r-title">Título</Label><Input id="r-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-type">Tipo</Label>
            <Select id="r-type" required value={f.activity_type_id} onChange={(e) => setF({ ...f, activity_type_id: e.target.value })}>
              <option value="">Selecione…</option>
              {types.data?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-day">Dia da semana</Label>
            <Select id="r-day" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="r-start">Início</Label><TimeInput id="r-start" value={f.start_time} onChange={(v) => setF({ ...f, start_time: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-end">Fim</Label><TimeInput id="r-end" value={f.end_time} onChange={(v) => setF({ ...f, end_time: v })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="r-loc">Local</Label><Input id="r-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="r-from">A partir de</Label><DateInput id="r-from" required value={f.starts_on} onChange={(v) => setF({ ...f, starts_on: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="r-until">Até (opcional)</Label><DateInput id="r-until" min={f.starts_on || undefined} value={f.until} onChange={(v) => setF({ ...f, until: v })} /></div>
        </div>
        <Button type="submit" className="w-full" disabled={!f.title.trim() || !f.activity_type_id || !f.starts_on || save.isPending}>Salvar</Button>
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
    mutationFn: () => materialize(orgId, addDaysIso(todayIso(membership?.timezone), 84)),
    onSuccess: (n) => { toast.success(n ? `${n} evento(s) gerado(s).` : 'Tudo já está gerado.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const end = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('end_recurrence', { p_rule: id })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => { toast.success(`Recorrência encerrada. ${n} evento(s) futuro(s) cancelado(s).`); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Recorrências</h2>
        <div className="flex gap-2">
          <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>Gerar próximas datas</Button>
          <Button onClick={() => setSheet({ rule: null })}><Plus className="h-4 w-4" /> Nova</Button>
        </div>
      </div>
      <p className="text-muted-foreground">As próximas 12 semanas são geradas automaticamente quando a Direção abre a agenda.</p>
      {data?.length === 0 && <EmptyState>Nenhuma recorrência.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{r.title} {!r.is_active && <Badge>Encerrada</Badge>}</p>
              <p className="text-muted-foreground">
                {WEEKDAYS[r.weekday]}{r.start_time ? ` · ${formatTime(r.start_time)}${r.end_time ? `–${formatTime(r.end_time)}` : ''}` : ''}
                {r.location ? ` · ${r.location}` : ''} · desde {formatDate(r.starts_on)}{r.until ? ` até ${formatDate(r.until)}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSheet({ rule: r })}>Editar</Button>
              {r.is_active && (
                <Button size="sm" variant="ghost" className="text-destructive" disabled={end.isPending}
                  onClick={() => { if (window.confirm('Encerrar esta recorrência? Eventos futuros sem presença serão cancelados.')) end.mutate(r.id) }}>
                  Encerrar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <RuleSheet key={sheet.rule?.id ?? 'new'} rule={sheet.rule} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
