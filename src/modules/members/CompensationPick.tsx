import { Button } from '@/components/ui/primitives'

export type Compensation = 'paid' | 'collaborative'
export const COMP_LABEL: Record<Compensation, string> = { paid: 'Remunerada', collaborative: 'Colaborativa' }

/** Escolha obrigatória: a colaboração é remunerada ou colaborativa. */
export function CompensationPick({ value, onChange }: { value: Compensation | null; onChange: (c: Compensation) => void }) {
  return (
    <div className="inline-flex gap-1" role="radiogroup" aria-label="Tipo de colaboração">
      {(['paid', 'collaborative'] as const).map((c) => (
        <Button key={c} type="button" size="sm" variant={value === c ? 'default' : 'outline'} role="radio" aria-checked={value === c} onClick={() => onChange(c)}>{COMP_LABEL[c]}</Button>
      ))}
    </div>
  )
}
