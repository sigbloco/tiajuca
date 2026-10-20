import { cn } from '@/components/ui/primitives'
import { NO_PITCH, TUNINGS } from '@/modules/repertoire/service'

/** Afinação do instrumento em chips lado a lado. "Altura indefinida" anula a afinação (esconde as outras). */
export function TuningChips({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const indef = value === NO_PITCH
  const chip = (on: boolean) => cn('min-h-9 rounded-full border px-3 text-sm font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Afinação">
      {!indef && TUNINGS.map((t) => (
        <button key={t} type="button" aria-pressed={value === t} disabled={disabled} onClick={() => onChange(value === t ? null : t)} className={chip(value === t)}>{t}</button>
      ))}
      <button type="button" aria-pressed={indef} disabled={disabled} onClick={() => onChange(indef ? null : NO_PITCH)} className={chip(indef)}>Altura indefinida</button>
    </div>
  )
}
