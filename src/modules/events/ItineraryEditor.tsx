import { Plus, Trash2 } from 'lucide-react'
import { TimeInput } from '@/components/ui/masked-inputs'
import { Button, Input, Label } from '@/components/ui/primitives'
import type { ItineraryStep } from './service'

/** Editor de roteiro, usado em eventos e recorrências: cada item tem início, fim, nome, local e descrição. */
export function ItineraryEditor({ steps, onChange }: { steps: ItineraryStep[]; onChange: (s: ItineraryStep[]) => void }) {
  const setStep = (i: number, p: Partial<ItineraryStep>) => onChange(steps.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-2">
      <Label>Roteiro</Label>
      {steps.map((x, i) => (
        <div key={i} className="space-y-2 rounded-md bg-muted/40 p-2">
          <div className="flex items-end gap-2">
            <div className="w-24 shrink-0 space-y-1"><Label htmlFor={`it-start-${i}`} className="text-xs">Início</Label><TimeInput id={`it-start-${i}`} value={x.time} onChange={(v) => setStep(i, { time: v })} /></div>
            <div className="w-24 shrink-0 space-y-1"><Label htmlFor={`it-end-${i}`} className="text-xs">Fim</Label><TimeInput id={`it-end-${i}`} value={x.end ?? ''} onChange={(v) => setStep(i, { end: v })} /></div>
            <div className="ml-auto"><Button type="button" size="icon" variant="ghost" aria-label={`Remover item ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button></div>
          </div>
          <div className="space-y-1"><Label htmlFor={`it-label-${i}`} className="text-xs">Item</Label><Input id={`it-label-${i}`} placeholder="Ex.: ensaio, passagem de som" value={x.label} onChange={(e) => setStep(i, { label: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`it-loc-${i}`} className="text-xs">Local</Label><Input id={`it-loc-${i}`} value={x.location ?? ''} onChange={(e) => setStep(i, { location: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`it-desc-${i}`} className="text-xs">Descrição</Label>
            <textarea id={`it-desc-${i}`} rows={2} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={x.description ?? ''} onChange={(e) => setStep(i, { description: e.target.value })} /></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...steps, { time: '', label: '' }])}><Plus className="h-4 w-4" /> Item</Button>
    </div>
  )
}

/** Itens salvos → itens do formulário (horários sem os segundos). */
export const loadSteps = (items: ItineraryStep[] | null | undefined): ItineraryStep[] =>
  (items ?? []).map((x) => ({ time: x.time.slice(0, 5), label: x.label, end: x.end?.slice(0, 5) ?? '', location: x.location ?? '', description: x.description ?? '' }))

/** Itens do formulário → o que se grava: só os que têm início e nome, sem campos vazios, em ordem de horário. */
export const cleanSteps = (steps: ItineraryStep[]): ItineraryStep[] =>
  steps.filter((x) => x.time && x.label.trim()).map((x) => ({
    time: x.time, label: x.label.trim(),
    ...(x.end ? { end: x.end } : {}), ...(x.location?.trim() ? { location: x.location.trim() } : {}), ...(x.description?.trim() ? { description: x.description.trim() } : {}),
  })).sort((a, b) => a.time.localeCompare(b.time))
