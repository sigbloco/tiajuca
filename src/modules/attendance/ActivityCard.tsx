import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatTime } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { cancelWord, setActivityStatus, type Activity, type AudienceInput } from '@/modules/events/service'
import { promptBox } from '@/components/shared/DialogHost'
import { usePermission } from '@/core/permissions'
import { notifyChange } from '@/core/undo'
import { type RosterRow, type InstrumentInfo, countable } from './attendanceData'

export function ActivityCard({ a, instruments, studentIds, slug, audience, staff, studentMembers, presentIds }: {
  a: Activity; instruments: InstrumentInfo[]; studentIds: Set<string>; slug?: string; audience?: AudienceInput[]
  staff: Set<string>; studentMembers?: Set<string>; presentIds: Set<string>
}) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('events.manage')
  // Cancelar o evento inteiro: igual ao botão do calendário (pede o motivo; dá para desfazer).
  const cancel = useMutation({
    mutationFn: (reason: string) => setActivityStatus(orgId, a.id, 'cancelled', reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', orgId] }); notifyChange('Cancelado.', async () => { await setActivityStatus(orgId, a.id, 'scheduled'); qc.invalidateQueries({ queryKey: ['activities', orgId] }) }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const reopen = useMutation({
    mutationFn: () => setActivityStatus(orgId, a.id, 'scheduled'),
    onSuccess: () => { toast.success('Reativado.'); qc.invalidateQueries({ queryKey: ['activities', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Cancelar só um instrumento neste dia (o evento segue para os demais).
  const cancelledQ = useQuery({
    queryKey: ['item-cancel', a.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_item_cancellations').select('instrument_id').eq('activity_id', a.id)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.instrument_id as string))
    },
  })
  const cancelledInst = cancelledQ.data ?? new Set<string>()
  const toggleInst = useMutation({
    mutationFn: async (v: { id: string; name: string; cancel: boolean }) => {
      if (v.cancel) {
        const reason = await promptBox({ title: 'Cancelar', message: `Cancelar a aula de ${v.name} neste dia?\nMotivo (ex.: professor ausente):`, confirmLabel: 'Cancelar', cancelLabel: 'Voltar' })
        if (reason === null) return
        const { error } = await supabase.from('activity_item_cancellations').insert({ organization_id: orgId, activity_id: a.id, instrument_id: v.id, reason: reason.trim() || null })
        if (error) throw error
      } else {
        const { error } = await supabase.from('activity_item_cancellations').delete().eq('activity_id', a.id).eq('instrument_id', v.id)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-cancel', a.id] }),
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Presentes / total por instrumento (ex.: "Agogô 0/2"), a partir da lista de quem é esperado na chamada.
  const roster = useQuery({
    queryKey: ['roster-counts', a.id],
    enabled: a.status !== 'cancelled',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_attendance_roster', { p_activity: a.id })
      if (error) throw error
      return (data ?? []) as RosterRow[]
    },
  })
  const rows = roster.data ? countable(roster.data, a, (audience ?? []).length > 0, staff, studentMembers) : null
  const countOf = (name: string) => {
    if (!rows) return null
    const mine = rows.filter((r) => (r.instruments ?? '').split(', ').includes(name))
    return `${mine.filter((r) => r.status_id && presentIds.has(r.status_id)).length}/${mine.length}`
  }
  // Evento com PÚBLICO definido: os botões são os instrumentos desse público (naipe escolhido ou o próprio instrumento).
  // Sem público: todos os instrumentos com alunos.
  const places = (audience ?? []).filter((x) => x.kind !== 'category') // categorias (Aluno…) não escolhem instrumento
  const shown = (places.length > 0
    ? instruments.filter((i) => places.some((x) => (x.kind === 'section' ? x.ref_id === i.section_id : x.ref_id === i.id)))
    : instruments.filter((i) => studentIds.has(i.id)))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'))
  if (a.status === 'cancelled') {
    return (
      <Card className="flex gap-3 p-3 opacity-60">
        <p className="w-12 shrink-0 font-display font-bold">{formatTime(a.start_time) || '—'}</p>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words font-semibold line-through">{a.title}</p>
            <Badge className="shrink-0">Cancelado{a.cancel_reason ? ` · ${a.cancel_reason}` : ''}</Badge>
          </div>
          {canManage && <Button size="sm" variant="outline" aria-label="Desfazer cancelamento" title="Desfazer cancelamento" disabled={reopen.isPending} onClick={() => reopen.mutate()}><Undo2 className="h-4 w-4" /> Desfazer</Button>}
        </div>
      </Card>
    )
  }
  return (
    <Card className="flex gap-3 p-3">
      <p className="w-12 shrink-0 font-display font-bold">{formatTime(a.start_time) || '—'}</p>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/${slug}/presenca/${a.id}`} className="block min-w-0 break-words font-semibold hover:underline">{a.title}</Link>
          {canManage && (
            <Button size="icon" variant="ghost" className="-mt-1 h-8 w-8 shrink-0 text-destructive" aria-label={`Cancelar ${cancelWord(a.activity_types?.name)}`} title={`Cancelar ${cancelWord(a.activity_types?.name)}`}
              disabled={cancel.isPending}
              onClick={async () => { const reason = await promptBox({ title: 'Cancelar', message: `Cancelar ${cancelWord(a.activity_types?.name)} de ${a.title}?\nMotivo (ex.: chuva):`, confirmLabel: 'Cancelar o evento', cancelLabel: 'Voltar' }); if (reason !== null) cancel.mutate(reason) }}><Ban className="h-4 w-4" /></Button>
          )}
        </div>
        {shown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shown.map((i) => {
              const off = cancelledInst.has(i.id)
              return (
                <span key={i.id} className={cn('inline-flex items-center rounded-full border border-border bg-card text-sm font-medium', off && 'opacity-60')}>
                  <Link to={`/${slug}/presenca/${a.id}?naipe=${encodeURIComponent(i.section)}&inst=${encodeURIComponent(i.name)}`}
                    className={cn('rounded-l-full py-1.5 pl-3 hover:bg-muted', canManage ? 'pr-1.5' : 'rounded-r-full pr-3')}>
                    <span className={off ? 'line-through' : undefined}>{i.name}</span>
                    {off ? <span className="ml-1.5 text-xs text-muted-foreground">sem aula</span> : countOf(i.name) && <span className="ml-1.5 text-muted-foreground">{countOf(i.name)}</span>}
                  </Link>
                  {canManage && (
                    <button type="button" disabled={toggleInst.isPending} aria-label={off ? `Desfazer o cancelamento de ${i.name}` : `Cancelar a aula de ${i.name}`} title={off ? 'Desfazer o cancelamento' : 'Cancelar a aula deste instrumento'}
                      className="mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => toggleInst.mutate({ id: i.id, name: i.name, cancel: !off })}>
                      {off ? <Undo2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
