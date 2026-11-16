import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { SaveInput } from '@/components/shared/ConfirmField'
import { FitWord } from '@/components/shared/FitText'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Button, Card, EmptyState, Input, cn } from '@/components/ui/primitives'
import { HolidaysSettings } from '@/modules/billing/BillingSettings'
import { requireFields } from '@/core/required'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { RecurrencesSettings } from './RecurrencesSettings'
import { COLOR_DOT, COLOR_LABEL, listActivityTypes, type ActivityTypeRow, type TypeColor } from './service'

type Tab = 'tipos' | 'recorrencias' | 'checklists' | 'feriados'
const TABS: [Tab, string][] = [['tipos', 'Tipos de evento'], ['recorrencias', 'Recorrências'], ['checklists', 'Checklists'], ['feriados', 'Feriados']]

/** Configurações do Calendário: tipos de evento, recorrências, checklists (modelos) e feriados. */
export function EventSettingsPage() {
  const canManage = usePermission('events.manage')
  const [tab, setTab] = useState<Tab>('tipos')
  useRegisterCrumb(TABS.find((t) => t[0] === tab)![1], () => setTab('tipos'), tab !== 'tipos', 0)
  if (!canManage) return <EmptyState>Sem permissão para configurar o calendário.</EmptyState>
  return (
    <div className="space-y-4">
      <ButtonRow role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('rounded-full px-2 py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}><FitWord>{label}</FitWord></button>
        ))}
      </ButtonRow>
      {tab === 'tipos' && <EventTypesSettings />}
      {tab === 'recorrencias' && <RecurrencesSettings />}
      {tab === 'checklists' && <TemplatesSettings canEdit={canManage} />}
      {tab === 'feriados' && <HolidaysSettings />}
    </div>
  )
}

function EventTypesSettings() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const types = useQuery({ queryKey: ['activity-types', orgId], queryFn: () => listActivityTypes(orgId) })
  const [name, setName] = useState('')
  const [color, setColor] = useState<TypeColor>('primary')
  const [attendance, setAttendance] = useState(false)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['activity-types', orgId] }); qc.invalidateQueries({ queryKey: ['activities', orgId] }) }
  const patch = useMutation({
    mutationFn: async (v: { id: string; p: Partial<Pick<ActivityTypeRow, 'name' | 'color' | 'is_active' | 'attendance_default'>> }) => {
      const { error } = await supabase.from('activity_types').update(v.p).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activity_types').insert({ organization_id: orgId, name: name.trim(), color, attendance_default: attendance, sort_order: (types.data?.length ?? 0) + 1 })
      if (error) throw error
    },
    onSuccess: () => { setName(''); setAttendance(false); toast.success('Tipo criado.'); refresh() }, onError: (e) => toast.error(friendlyError(e)),
  })
  const active = (types.data ?? []).filter((t) => t.is_active)
  const off = (types.data ?? []).filter((t) => !t.is_active)
  const row = (t: ActivityTypeRow) => (
    <Card key={t.id} className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <SaveInput value={t.name} autoSave aria-label="Nome do tipo" onSave={(v) => { if (v.trim()) patch.mutate({ id: t.id, p: { name: v.trim() } }) }} />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={t.is_active ? `Desativar ${t.name}` : `Reativar ${t.name}`} title={t.is_active ? 'Desativar' : 'Reativar'}
          onClick={() => patch.mutate({ id: t.id, p: { is_active: !t.is_active } })}>{t.is_active ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}</Button>
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" className="h-4 w-4" checked={t.attendance_default} onChange={(e) => patch.mutate({ id: t.id, p: { attendance_default: e.target.checked } })} /> Presença por padrão
      </label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
        {(Object.keys(COLOR_LABEL) as TypeColor[]).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={t.color === c} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} onClick={() => patch.mutate({ id: t.id, p: { color: c } })}
            className={cn('flex items-center rounded-full border p-1.5', t.color === c ? 'border-primary bg-muted ring-2 ring-primary' : 'border-border')}><span className={cn('h-4 w-4 rounded-full', COLOR_DOT[c])} /></button>
        ))}
      </div>
    </Card>
  )
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Tipos dos eventos (Ensaio, Oficina, Apresentação…). Cada evento tem um tipo principal, que dá a cor no calendário, e pode acumular outros em “Também é”. “Presença por padrão” só pré-marca a opção ao criar o evento.</p>
      <Card className="space-y-2 p-3">
        <Input aria-label="Novo tipo" placeholder="Novo tipo" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4" checked={attendance} onChange={(e) => setAttendance(e.target.checked)} /> Presença por padrão</label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do novo tipo">
          {(Object.keys(COLOR_LABEL) as TypeColor[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} onClick={() => setColor(c)}
              className={cn('flex items-center rounded-full border p-1.5', color === c ? 'border-primary bg-muted ring-2 ring-primary' : 'border-border')}><span className={cn('h-4 w-4 rounded-full', COLOR_DOT[c])} /></button>
          ))}
        </div>
        <Button variant="add" className="w-full" disabled={add.isPending} onClick={() => { if (requireFields([['Nome', name.trim()]])) add.mutate() }}><Plus className="h-4 w-4" /> Novo tipo</Button>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2"><ProgressiveList items={active} render={row} /></div>
      {off.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">Desativados ({off.length})</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2"><ProgressiveList items={off} render={row} /></div>
        </details>
      )}
    </div>
  )
}
