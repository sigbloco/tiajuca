import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input, cn } from '@/components/ui/primitives'

export interface AutoOption { id: string; label: string; hint?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Campo de escrever com sugestões (sem diferenciar acento/maiúscula). Ao escolher, devolve a opção: quem chama a transforma em chip. */
export function AutoComplete({ options, onPick, placeholder, disabled, 'aria-label': ariaLabel }: {
  options: AutoOption[]
  onPick: (o: AutoOption) => void
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => {
    const q = norm(text.trim())
    return options.filter((o) => !q || norm(`${o.label} ${o.hint ?? ''}`).includes(q)).slice(0, 8)
  }, [options, text])
  const pick = (o: AutoOption) => { onPick(o); setText(''); setOpen(false) }
  return (
    <div className="relative min-w-40 flex-1">
      <Plus className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
      <Input className="pl-9" value={text} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off" role="combobox" aria-expanded={open}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) pick(matches[0]) }
          if (e.key === 'Escape') { setText(''); setOpen(false) }
        }} />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-card shadow-card">
          {matches.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nada encontrado.</li>}
          {matches.map((o) => (
            <li key={o.id} role="option" aria-selected={false}>
              <button type="button" className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted')}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
                <span className="font-semibold">{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Chip simples (rótulo + X opcional). */
export function Chip({ label, onRemove, removeLabel, className }: { label: string; onRemove?: () => void; removeLabel?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 text-sm font-semibold', onRemove ? 'pr-1' : 'pr-3', className)}>
      {label}
      {onRemove && (
        <button type="button" className="rounded-full p-1 hover:bg-background" aria-label={removeLabel ?? `Remover ${label}`} onClick={onRemove}>
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  )
}
