import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Label, Select } from '@/components/ui/primitives'
import type { ActivityTypeRow } from './service'

/** Tipo principal (dá a cor) em menu e "Também é": tipos extras acumuláveis, como nas categorias dos integrantes. `ids[0]` é o principal. */
export function TypePicker({ types, ids, onChange }: { types: ActivityTypeRow[]; ids: string[]; onChange: (ids: string[], primaryChanged: boolean) => void }) {
  const [adding, setAdding] = useState(false)
  const [primary, ...extras] = ids
  const usable = types.filter((t) => t.is_active || ids.includes(t.id))
  const name = (id: string) => types.find((t) => t.id === id)?.name ?? '—'
  const options = usable.filter((t) => !ids.includes(t.id))
  return (
    <div className="space-y-1.5">
      <Label htmlFor="type-main" required>Tipo</Label>
      <Select id="type-main" required value={primary ?? ''} onChange={(e) => onChange([e.target.value, ...extras.filter((x) => x !== e.target.value)], true)}>
        <option value="">Escolha</option>
        {usable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
      {primary && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Também é:</span>
          {adding ? (
            <Select aria-label="Outro tipo" autoFocus defaultValue="" onChange={(e) => { if (e.target.value) { onChange([...ids, e.target.value], false); setAdding(false) } }} onBlur={() => setAdding(false)}>
              <option value="">Escolha</option>
              {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          ) : options.length > 0 && (
            <button type="button" className="tap-44 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Acumular outro tipo" title="Acumular outro tipo" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /></button>
          )}
          {extras.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground">
              {name(id)}
              <button type="button" aria-label={`Remover ${name(id)}`} title="Remover" className="rounded-full px-1 text-muted-foreground hover:text-destructive" onClick={() => onChange(ids.filter((x) => x !== id), false)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
