import { Plus, Trash2 } from 'lucide-react'
import { TimeInput } from '@/components/ui/masked-inputs'
import { Button, Input, Label } from '@/components/ui/primitives'
import type { ItineraryStep } from './service'

/** Editor de roteiro (etapas com horário), usado em eventos e recorrências. */
export function ItineraryEditor({ steps, onChange }: { steps: ItineraryStep[]; onChange: (s: ItineraryStep[]) => void }) {
  const setStep = (i: number, p: Partial<ItineraryStep>) => onChange(steps.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-2">
      <Label>Roteiro</Label>
      {steps.map((x, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-24 shrink-0"><TimeInput aria-label={`Horário da etapa ${i + 1}`} value={x.time} onChange={(v) => setStep(i, { time: v })} /></div>
          <Input aria-label={`Nome da etapa ${i + 1}`} placeholder="Etapa" value={x.label} onChange={(e) => setStep(i, { label: e.target.value })} />
          <Button type="button" size="icon" variant="ghost" aria-label="Remover etapa" onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...steps, { time: '', label: '' }])}><Plus className="h-4 w-4" /> Etapa</Button>
      <p className="text-xs text-muted-foreground/80">Exemplos: chegada, concentração, passagem de som…</p>
    </div>
  )
}

export const cleanSteps = (steps: ItineraryStep[]) =>
  steps.filter((x) => x.time && x.label.trim()).map((x) => ({ time: x.time, label: x.label.trim() })).sort((a, b) => a.time.localeCompare(b.time))
