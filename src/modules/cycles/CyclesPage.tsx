import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { todayIso } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCycleTypes, useCycles, type Cycle } from './service'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** "2026-08-01" → "ago/2026". */
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`
const toMonthValue = (iso: string) => iso.slice(0, 7)
const firstDay = (ym: string) => `${ym}-01`
const lastDay = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }

/** Criar ou editar um ciclo: só mês e ano (o dia 1 e o último dia vêm sozinhos). */
function CycleSheet({ cycle, onClose }: { cycle: Cycle | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: types } = useCycleTypes()
  const [form, setForm] = useState({ cycle_type_id: cycle?.cycle_type_id ?? '', name: cycle?.name ?? '', start: cycle ? toMonthValue(cycle.starts_on) : '', end: cycle ? toMonthValue(cycle.ends_on) : '' })
  const valid = form.cycle_type_id && form.name.trim() && form.start && form.end && form.end >= form.start
  const save = useMutation({
    mutationFn: async () => {
      const row = { cycle_type_id: form.cycle_type_id, name: form.name.trim(), starts_on: firstDay(form.start), ends_on: lastDay(form.end) }
      const q = cycle ? supabase.from('cycles').update(row).eq('id', cycle.id).eq('organization_id', orgId)
        : supabase.from('cycles').insert({ ...row, organization_id: orgId, status: 'planned' })
      const { error } = await q
      if (error) throw error
      await supabase.rpc('refresh_current_cycle', { p_org: orgId })
    },
    onSuccess: () => { toast.success(cycle ? 'Ciclo atualizado.' : 'Ciclo criado.'); qc.invalidateQueries({ queryKey: ['cycles', orgId] }); qc.invalidateQueries({ queryKey: ['members'] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={cycle ? 'Editar ciclo' : 'Novo ciclo'} description="Ex.: Carnaval 2026/27 ou Junino 2027. Só o mês e o ano importam.">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cy-type">Tipo</Label>
          <Select id="cy-type" required value={form.cycle_type_id} onChange={(e) => setForm({ ...form, cycle_type_id: e.target.value })}>
            <option value="">Selecione…</option>
            {types?.filter((t) => t.is_active || t.id === form.cycle_type_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="cy-name">Nome</Label><Input id="cy-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="cy-start">Início (mês e ano)</Label><Input id="cy-start" type="month" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cy-end">Término (mês e ano)</Label><Input id="cy-end" type="month" required min={form.start || undefined} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
        </div>
        <Button type="submit" className="w-full" disabled={!valid || save.isPending}>{cycle ? 'Salvar' : 'Criar ciclo'}</Button>
      </form>
    </SheetContent>
  )
}

interface Blockers { participations: number; events: number; attendance: number; forms: number; submissions: number; capacity: number; reactivations: number }

/** O que impede a exclusão do ciclo, com a opção de apagar tudo isso junto. */
function BlockersSheet({ cycle, onClose }: { cycle: Cycle; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const info = useQuery({
    queryKey: ['cycle-blockers', cycle.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cycle_blockers', { p_cycle: cycle.id })
      if (error) throw error
      return data as Blockers
    },
  })
  const wipe = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('delete_cycle_cascade', { p_cycle: cycle.id }); if (error) throw error },
    onSuccess: () => { toast.success('Ciclo e tudo que dependia dele foram apagados.'); qc.invalidateQueries({ queryKey: ['cycles', orgId] }); qc.invalidateQueries({ queryKey: ['members'] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const b = info.data
  const rows: [number | undefined, string][] = [
    [b?.participations, 'participações de integrantes no ciclo (quem estava ativo, inativo ou na lista de espera)'],
    [b?.events, 'eventos do calendário'],
    [b?.attendance, 'registros de presença desses eventos'],
    [b?.forms, 'formulários de inscrição'],
    [b?.submissions, 'inscrições recebidas nesses formulários'],
    [b?.capacity, 'configurações de vagas por instrumento'],
    [b?.reactivations, 'pedidos de reativação'],
  ]
  return (
    <SheetContent title={`Excluir ${cycle.name}`} description="O que está impedindo a exclusão">
      {info.isLoading && <Skeleton className="h-24" />}
      {info.isError && <p className="text-destructive">{friendlyError(info.error)}</p>}
      {b && (
        <>
          <p>Este ciclo não pode ser excluído porque outras informações dependem dele:</p>
          <ul className="list-disc space-y-1 pl-5">
            {rows.filter(([n]) => (n ?? 0) > 0).map(([n, label]) => <li key={label}><strong>{n}</strong> {label}</li>)}
          </ul>
          <p className="rounded-lg bg-warning/15 p-3 text-sm">Para excluir, é preciso apagar tudo isso junto. <strong>Isso não pode ser desfeito</strong> e remove o histórico do ciclo. Se só quiser tirá-lo da vista, edite as datas em vez de excluir.</p>
          <Button variant="destructive" disabled={wipe.isPending}
            onClick={() => { if (window.confirm(`Apagar o ciclo “${cycle.name}” e tudo que depende dele? Isso não pode ser desfeito.`)) wipe.mutate() }}>{wipe.isPending ? 'Apagando…' : 'Apagar tudo isso e o ciclo'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </>
      )}
    </SheetContent>
  )
}

/** Ciclos agrupados pela data: Atual (ou Atuais), Próximos e Passados. Sem status manual: a data diz se já foi, está acontecendo ou vai acontecer. */
export function CyclesPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('cycles.manage')
  const { data: cycles, isLoading } = useCycles()
  const { data: types } = useCycleTypes()
  const [sheet, setSheet] = useState<{ cycle: Cycle | null; blockers?: boolean } | null>(null)
  const [blocked, setBlocked] = useState<Cycle | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const today = todayIso(membership?.timezone)

  const del = useMutation({
    mutationFn: async (c: Cycle) => {
      const { error } = await supabase.from('cycles').delete().eq('id', c.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { setBlocked(null); toast.success('Ciclo excluído.'); qc.invalidateQueries({ queryKey: ['cycles', orgId] }) },
    onError: (e, c) => { if (/foreign key|violates|23503/i.test(String((e as Error).message ?? e))) setBlocked(c); else toast.error(friendlyError(e)) },
  })

  const all = (cycles ?? []).filter((c) => c.is_active)
  const current = all.filter((c) => c.starts_on <= today && today <= c.ends_on).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const upcoming = all.filter((c) => c.starts_on > today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const past = all.filter((c) => c.ends_on < today).sort((a, b) => b.starts_on.localeCompare(a.starts_on))
  const groups: [string, Cycle[]][] = [[current.length > 1 ? 'Atuais' : 'Atual', current], ['Próximos', upcoming], ['Passados', past]]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2>Ciclos</h2>
        {canManage && <Button onClick={() => setSheet({ cycle: null })}><Plus className="h-4 w-4" /> Novo ciclo</Button>}
      </div>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && (sheet.blockers && sheet.cycle
          ? <BlockersSheet key={`b-${sheet.cycle.id}`} cycle={sheet.cycle} onClose={() => { setSheet(null); setBlocked(null) }} />
          : <CycleSheet key={sheet.cycle?.id ?? 'new'} cycle={sheet.cycle} onClose={() => setSheet(null)} />)}
      </Sheet>
      {blocked && (
        <Card role="alert" className="flex flex-wrap items-center justify-between gap-2 border-destructive p-3">
          <p className="font-semibold text-destructive">Este ciclo já tem participações ou eventos. Não dá para excluí-lo.</p>
          <Button size="sm" variant="outline" onClick={() => setSheet({ cycle: blocked, blockers: true })}>Mais detalhes</Button>
        </Card>
      )}
      {isLoading && <Skeleton className="h-24" />}
      {cycles?.length === 0 && <EmptyState>Nenhum ciclo criado. Crie o primeiro para controlar vagas e participação.</EmptyState>}
      {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <Collapsible key={title} open={open[title] ?? title.startsWith('Atua')} onToggle={() => setOpen((o) => ({ ...o, [title]: !(o[title] ?? title.startsWith('Atua')) }))} title={title} count={list.length}>
          <div className="grid gap-2">
            {list.map((c) => (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-display text-lg font-bold">{c.name} {c.is_current && <Badge className="bg-primary text-primary-foreground">Principal</Badge>}</p>
                  <p className="text-muted-foreground">{types?.find((t) => t.id === c.cycle_type_id)?.name} · {monthYear(c.starts_on)} a {monthYear(c.ends_on)}</p>
                </div>
                {canManage && (
                  <div className="flex items-center">
                    <Button size="icon" variant="ghost" aria-label={`Editar ${c.name}`} title="Editar" onClick={() => setSheet({ cycle: c })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${c.name}`} title="Excluir"
                      onClick={() => { if (window.confirm(`Excluir o ciclo “${c.name}”? Isso não pode ser desfeito.`)) del.mutate(c) }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Collapsible>
      ))}
    </div>
  )
}
