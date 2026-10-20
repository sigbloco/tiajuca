import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput, TimeInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { todayIso } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { WEEKDAYS_PLURAL, cleanSchedule, hasFutureSlot, scheduleText, validateSchedule, type ScheduleSlot } from './schedule'
import { deletePickupPoint, listPickupPoints, savePickupPoint, type PickupPoint } from './service'

function PickupSheet({ point, onClose }: { point: PickupPoint | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: point?.name ?? '', address: point?.address ?? '', opening_hours: point?.opening_hours ?? '', is_active: point?.is_active ?? true })
  const [slots, setSlots] = useState<ScheduleSlot[]>(point?.schedule ?? [])
  const [errors, setErrors] = useState<string[]>([])
  const today = todayIso()
  const preview = scheduleText(slots, f.opening_hours, today)

  const setSlot = (i: number, patch: Partial<ScheduleSlot>) => setSlots((cur) => cur.map((s, j) => (j === i ? ({ ...s, ...patch } as ScheduleSlot) : s)))
  const changeType = (i: number, type: ScheduleSlot['type']) =>
    setSlots((cur) => cur.map((s, j) => (j === i ? (type === 'weekly' ? { type, weekday: 1, start: s.start, end: s.end, label: s.label } : { type, date: '', start: s.start, end: s.end, label: s.label }) : s)))

  const save = useMutation({
    mutationFn: async () => {
      const errs = validateSchedule(slots)
      setErrors(errs)
      if (errs.length) return false
      await savePickupPoint(orgId, point?.id ?? null, {
        name: f.name.trim(), address: f.address.trim(), opening_hours: f.opening_hours.trim(), is_active: f.is_active, schedule: cleanSchedule(slots),
      })
      return true
    },
    onSuccess: (saved) => { if (saved) { qc.invalidateQueries({ queryKey: ['shop', orgId, 'pickup'] }); toast.success('Ponto de retirada salvo.'); onClose() } },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <SheetContent title={point ? 'Editar ponto de retirada' : 'Novo ponto de retirada'} description="O cliente escolhe um ponto ativo no checkout.">
      <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.address.trim()) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="pp-name">Nome</Label>
          <Input id="pp-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-addr">Endereço</Label>
          <Input id="pp-addr" required value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>

        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">Dias e horários de retirada</legend>
          <p className="text-sm text-muted-foreground">Use <strong>toda semana</strong> para dias fixos (ex.: ensaios às segundas) e <strong>data única</strong> para eventos. Datas que já passaram deixam de aparecer; se só sobrarem datas passadas, o ponto some do checkout.</p>
          {slots.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label="Tipo" className="w-36" value={s.type} onChange={(e) => changeType(i, e.target.value as ScheduleSlot['type'])}>
                  <option value="weekly">Toda semana</option>
                  <option value="date">Data única</option>
                </Select>
                {s.type === 'weekly'
                  ? <Select aria-label="Dia da semana" className="w-36" value={s.weekday} onChange={(e) => setSlot(i, { weekday: Number(e.target.value) })}>
                      {WEEKDAYS_PLURAL.map((d, n) => <option key={d} value={n}>{d}</option>)}
                    </Select>
                  : <div className="w-36"><DateInput aria-label="Data" value={s.date} min={today} onChange={(v) => setSlot(i, { date: v })} /></div>}
                <Button type="button" size="icon" variant="ghost" aria-label="Remover horário" onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>das</span><div className="w-24"><TimeInput value={s.start ?? ''} onChange={(v) => setSlot(i, { start: v })} /></div>
                <span>às</span><div className="w-24"><TimeInput value={s.end ?? ''} onChange={(v) => setSlot(i, { end: v })} /></div>
                <Input aria-label="Nome (opcional)" className="min-w-40 flex-1" placeholder="Nome (ex.: Ensaio, Feijoada)" maxLength={60} value={s.label ?? ''} onChange={(e) => setSlot(i, { label: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSlots((c) => [...c, { type: 'weekly', weekday: 1 }])}><Plus className="h-4 w-4" /> Dia da semana</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSlots((c) => [...c, { type: 'date', date: '' }])}><Plus className="h-4 w-4" /> Data única</Button>
          </div>
        </fieldset>

        <div className="space-y-1.5"><Label htmlFor="pp-hours">Observação (opcional)</Label>
          <Input id="pp-hours" placeholder="Ex.: Entrada pela portaria lateral" value={f.opening_hours} onChange={(e) => setF({ ...f, opening_hours: e.target.value })} /></div>

        <p className="rounded-lg bg-muted p-3 text-sm"><strong>O cliente verá:</strong> {preview.text || 'nenhum horário informado'}
          {preview.expired > 0 && <span className="text-muted-foreground"> ({preview.expired} data(s) já passada(s) não aparece(m))</span>}</p>
        {slots.length > 0 && !hasFutureSlot(slots, today) && <p role="alert" className="text-sm text-destructive">Todas as datas já passaram: este ponto não vai aparecer no checkout.</p>}

        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          Disponível no checkout
        </label>
        {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <Button type="submit" className="w-full" disabled={!f.name.trim() || !f.address.trim() || save.isPending}>Salvar</Button>
      </form>
    </SheetContent>
  )
}

export function PickupPointsTab() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<{ point: PickupPoint | null } | null>(null)
  const q = useQuery({ queryKey: ['shop', orgId, 'pickup'], queryFn: () => listPickupPoints(orgId) })
  const today = todayIso()
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: (p: PickupPoint) => deletePickupPoint(p.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop', orgId, 'pickup'] }); toast.success('Ponto de retirada excluído.') },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e)) ? 'Já existem pedidos com este ponto. Desative-o (Editar) em vez de excluir.' : friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Pontos de retirada</h2>
        <Button onClick={() => setSheet({ point: null })}><Plus className="h-4 w-4" /> Novo ponto</Button>
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os pontos de retirada.</EmptyState>}
      {q.data?.length === 0 && <EmptyState>Nenhum ponto de retirada ainda.</EmptyState>}
      {q.data?.map((p) => {
        const when = scheduleText(p.schedule, p.opening_hours, today).text
        const expired = !hasFutureSlot(p.schedule, today)
        return (
          <Card key={p.id} className={`flex items-start justify-between gap-2 p-3 ${p.is_active ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <p className="font-semibold">{p.name} {!p.is_active && <Badge>Inativo</Badge>} {expired && <Badge>Datas encerradas</Badge>}</p>
              <p className="text-sm">{p.address}</p>
              <p className="text-sm text-muted-foreground">{when || 'Horário não informado'}</p>
            </div>
            <div className="flex shrink-0">
              <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setSheet({ point: p })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${p.name}`} onClick={() => { if (window.confirm(`Excluir o ponto “${p.name}”? Isso não pode ser desfeito.`)) del.mutate(p) }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        )
      })}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <PickupSheet key={sheet.point?.id ?? 'new'} point={sheet.point} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
