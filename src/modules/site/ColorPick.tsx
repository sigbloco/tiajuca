import { Label } from '@/components/ui/primitives'

const BASE: [string, string][] = [['Branco', '#FFFFFF'], ['Creme', '#FFF8E7'], ['Cinza claro', '#F1F1EE'], ['Preto', '#1C1C14']]

/** Escolha de cor: sugestões (cores do bloco e neutras), seletor livre e "padrão do bloco" (vazio). */
export function ColorPick({ label, value, onChange, suggestions, hideDefault }: {
  hideDefault?: boolean; label: string; value: string | null; onChange: (v: string | null) => void; suggestions: [string, string | undefined][]
}) {
  const options = [...suggestions.filter((s): s is [string, string] => !!s[1]), ...BASE]
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {!hideDefault && <button type="button" onClick={() => onChange(null)} aria-pressed={value === null}
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${value === null ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>Padrão do bloco</button>}
        {options.map(([name, hex]) => (
          <button key={name} type="button" title={name} aria-label={`${name} ${hex}`} aria-pressed={value?.toLowerCase() === hex.toLowerCase()} onClick={() => onChange(hex)}
            className={`h-11 w-11 rounded-full border ${value?.toLowerCase() === hex.toLowerCase() ? 'border-primary ring-2 ring-primary' : 'border-border'}`} style={{ backgroundColor: hex }} />
        ))}
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">Outra
          <input type="color" aria-label={`${label}: outra cor`} className="h-11 w-14 cursor-pointer rounded border border-border bg-transparent" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        </label>
      </div>
    </div>
  )
}
