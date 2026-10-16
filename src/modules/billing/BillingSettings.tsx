import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

/** Feriados usados para empurrar o vencimento para o próximo dia útil. */
export function HolidaysSettings() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [day, setDay] = useState('')
  const [name, setName] = useState('')
  const { data } = useQuery({
    queryKey: ['holidays', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('day, name').eq('organization_id', orgId).gte('day', `${new Date().getFullYear()}-01-01`).order('day')
      if (error) throw error
      return (data ?? []) as { day: string; name: string }[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['holidays', orgId] })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('holidays').upsert({ organization_id: orgId, day, name: name.trim() }, { onConflict: 'organization_id,day' })
      if (error) throw error
    },
    onSuccess: () => { setDay(''); setName(''); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (d: string) => {
      const { error } = await supabase.from('holidays').delete().eq('organization_id', orgId).eq('day', d)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      <h2>Feriados</h2>
      <p className="text-muted-foreground">Se o dia 10 (vencimento) cair em fim de semana ou feriado, a cobrança vence no próximo dia útil. Sem juros.</p>
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="w-36"><DateInput value={day} onChange={setDay} aria-label="Data do feriado" /></div>
        <Input className="min-w-40 flex-1" placeholder="Nome do feriado" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!day || !name.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</Button>
      </Card>
      <div className="grid gap-1.5">
        {data?.map((h) => (
          <Card key={h.day} className="flex items-center justify-between p-2 pl-3">
            <span><span className="font-semibold">{formatDate(h.day)}</span> · {h.name}</span>
            <Button size="icon" variant="ghost" aria-label={`Remover ${h.name}`} onClick={() => del.mutate(h.day)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
