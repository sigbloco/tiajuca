import { cn } from '@/components/ui/primitives'
import { NO_PITCH, TUNINGS } from '@/modules/repertoire/service'

/** Afinação do instrumento em chips lado a lado. Marcar "Altura indefinida" anula a afinação: os chips somem e nada aparece em lugar nenhum. */
export function TuningChips({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const indef = value === NO_PITCH
  const chip = (on: boolean) => cn('min-h-9 rounded-full border px-3 text-sm font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" role="group" aria-label="Afinação">
      {!indef && (
        <div className="flex flex-wrap items-center gap-1.5">
          {TUNINGS.map((t) => (
            <button key={t} type="button" aria-pressed={value === t} disabled={disabled} onClick={() => onChange(value === t ? null : t)} className={chip(value === t)}>{t}</button>
          ))}
        </div>
      )}
      <label className="inline-flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={indef} onChange={(e) => onChange(e.target.checked ? NO_PITCH : null)} /> Altura indefinida
      </label>
    </div>
  )
}
