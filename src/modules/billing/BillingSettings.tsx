import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { useProgressive } from '@/components/shared/LoadMore'
import { Button, Card, Input, Select, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

type Scope = 'national' | 'state' | 'city'
const SCOPE_LABEL: Record<Scope, string> = { national: 'Nacional', state: 'Estadual (RJ)', city: 'Municipal (RJ)' }

/** Feriados usados para empurrar o vencimento para o próximo dia útil. */
export function HolidaysSettings() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [day, setDay] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<Scope>('national')
  const [filterScope, setFilterScope] = useState<'' | Scope>('')
  const { data } = useQuery({
    queryKey: ['holidays', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('holidays').select('day, name, scope').eq('organization_id', orgId).gte('day', `${new Date().getFullYear()}-01-01`).order('day')
      if (error) throw error
      return (data ?? []) as { day: string; name: string; scope: Scope }[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['holidays', orgId] })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('holidays').upsert({ organization_id: orgId, day, name: name.trim(), scope }, { onConflict: 'organization_id,day' })
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
  const shown = (data ?? []).filter((h) => !filterScope || h.scope === filterScope)
  const prog = useProgressive(shown, 5, filterScope)
  return (
    <div className="space-y-3">
      <h2>Feriados</h2>
      <p className="text-muted-foreground">Se o dia 10 (vencimento) cair em fim de semana ou feriado, a cobrança vence no próximo dia útil. Sem juros.</p>
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="w-36"><DateInput value={day} onChange={setDay} aria-label="Data do feriado" /></div>
        <Input className="min-w-40 flex-1" placeholder="Nome do feriado" value={name} onChange={(e) => setName(e.target.value)} />
        <Select aria-label="Tipo de feriado" className="w-40" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
        </Select>
        <Button disabled={!day || !name.trim() || add.isPending} onClick={() => add.mutate()}>Adicionar</Button>
      </Card>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar feriados">
        {([['', 'Todos'], ...Object.entries(SCOPE_LABEL)] as [string, string][]).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filterScope === k} onClick={() => setFilterScope(k as '' | Scope)}
            className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', filterScope === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>{label}</button>
        ))}
      </div>
      <div className="grid gap-1.5">
        {prog.visible.map((h) => (
          <Card key={h.day} className="flex items-center justify-between p-2 pl-3">
            <span><span className="font-semibold">{formatDate(h.day)}</span> · {h.name} <span className="text-xs text-muted-foreground">({SCOPE_LABEL[h.scope]})</span></span>
            <Button size="icon" variant="ghost" aria-label={`Remover ${h.name}`} onClick={() => del.mutate(h.day)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
        {shown.length === 0 && <p className="text-muted-foreground">Nenhum feriado neste filtro.</p>}
        {prog.button}
      </div>
    </div>
  )
}
