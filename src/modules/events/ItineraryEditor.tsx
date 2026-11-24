import { Plus, Trash2 } from 'lucide-react'
import { TimeInput } from '@/components/ui/masked-inputs'
import { Button, Input, Label } from '@/components/ui/primitives'
import type { ItineraryStep } from './service'

/** Editor de roteiro, usado em eventos e recorrências: cada item tem início, fim, nome, local e descrição. */
export function ItineraryEditor({ steps, onChange, defaultLocation }: { steps: ItineraryStep[]; onChange: (s: ItineraryStep[]) => void; /** Local do evento: o item sem local herda este. */ defaultLocation?: string }) {
  const setStep = (i: number, p: Partial<ItineraryStep>) => onChange(steps.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>Roteiro</Label>
        <button type="button" className="tap-44 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Adicionar item ao roteiro" title="Adicionar item"
          onClick={() => onChange([...steps, { time: '', label: '' }])}><Plus className="h-3.5 w-3.5" /></button>
      </div>
      {steps.map((x, i) => (
        <div key={i} className="relative space-y-2 rounded-md bg-muted/40 p-2">
          <span aria-hidden className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground">{i + 1}</span>
          {/* Celular: início, fim e item numa linha; o local embaixo. Computador: tudo numa linha só, com a lixeira no fim. */}
          <div className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1"><Label htmlFor={`it-start-${i}`} className="text-xs">Início</Label><TimeInput id={`it-start-${i}`} value={x.time} onChange={(v) => setStep(i, { time: v })} /></div>
            <div className="space-y-1"><Label htmlFor={`it-end-${i}`} className="text-xs">Fim</Label><TimeInput id={`it-end-${i}`} value={x.end ?? ''} onChange={(v) => setStep(i, { end: v })} /></div>
            <div className="min-w-0 space-y-1"><Label htmlFor={`it-label-${i}`} className="text-xs">Item</Label><Input id={`it-label-${i}`} placeholder="Ex.: ensaio" value={x.label} onChange={(e) => setStep(i, { label: e.target.value })} /></div>
            <div className="col-span-3 min-w-0 space-y-1 sm:col-span-1"><Label htmlFor={`it-loc-${i}`} className="text-xs">Local</Label><Input id={`it-loc-${i}`} placeholder={defaultLocation ? `Igual ao evento: ${defaultLocation}` : undefined} value={x.location ?? ''} onChange={(e) => setStep(i, { location: e.target.value })} /></div>
            <Button type="button" size="icon" variant="ghost" className="hidden sm:inline-flex" aria-label={`Remover item ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {/* Descrição só aparece se marcada (economiza espaço); desmarcar apaga o texto. */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" className="h-4 w-4" checked={x.description !== undefined} onChange={(e) => setStep(i, { description: e.target.checked ? '' : undefined })} /> Descrição
            </label>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 sm:hidden" aria-label={`Remover item ${i + 1}`} onClick={() => onChange(steps.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {x.description !== undefined && (
            <textarea id={`it-desc-${i}`} aria-label="Descrição do item" rows={2} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={x.description} onChange={(e) => setStep(i, { description: e.target.value })} />
          )}
        </div>
      ))}
    </div>
  )
}

/** Itens salvos → itens do formulário (horários sem os segundos). */
export const loadSteps = (items: ItineraryStep[] | null | undefined): ItineraryStep[] =>
  (items ?? []).map((x) => ({ time: x.time.slice(0, 5), label: x.label, end: x.end?.slice(0, 5) ?? '', location: x.location ?? '', description: x.description?.trim() ? x.description : undefined }))

/** Itens do formulário → o que se grava: só os que têm início e nome, sem campos vazios, em ordem de horário. */
export const cleanSteps = (steps: ItineraryStep[]): ItineraryStep[] =>
  steps.filter((x) => x.time && x.label.trim()).map((x) => ({
    time: x.time, label: x.label.trim(),
    ...(x.end ? { end: x.end } : {}), ...(x.location?.trim() ? { location: x.location.trim() } : {}), ...(x.description?.trim() ? { description: x.description.trim() } : {}),
  })).sort((a, b) => a.time.localeCompare(b.time))
