import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatTime } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import type { Activity } from './service'

interface MiniRule { id: string; title: string; weekday: number; start_time: string | null; end_time: string | null }

/** Dia aberto no calendário sem o evento de uma recorrência que cai nele (inclusive dias anteriores ao início dela): botão para gerar o evento ali. */
export function RecurrenceDay({ day, existing }: { day: string; existing: Activity[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const rules = useQuery({
    queryKey: ['recurrence-rules-min', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('recurrence_rules').select('id, title, weekday, start_time, end_time').eq('organization_id', orgId).eq('is_active', true).order('start_time')
      if (error) throw error
      return (data ?? []) as MiniRule[]
    },
  })
  const dow = new Date(`${day}T12:00:00`).getDay()
  const todo = (rules.data ?? []).filter((r) => r.weekday === dow && !existing.some((a) => a.recurrence_rule_id === r.id))
  const gen = useMutation({
    mutationFn: async (rule: string) => { const { error } = await supabase.rpc('generate_recurrence_day', { p_rule: rule, p_date: day }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', orgId] }); toast.success('Evento gerado neste dia.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (todo.length === 0) return null
  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm text-muted-foreground">Recorrência sem evento neste dia</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {todo.map((r) => (
          <Button key={r.id} variant="outline" disabled={gen.isPending} onClick={() => gen.mutate(r.id)}>
            <Plus className="h-4 w-4" /> Gerar {r.title}{r.start_time ? ` · ${formatTime(r.start_time)}` : ''}
          </Button>
        ))}
      </div>
    </Card>
  )
}
