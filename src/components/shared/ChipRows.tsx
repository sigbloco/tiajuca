import { Children, type ReactNode } from 'react'

/** Tamanhos das linhas: no máximo `max` por linha, o mais parelho possível (7 → 3+2+2, 5 → 3+2, 4 → 2+2). */
export function chipRowSizes(n: number, max = 3): number[] {
  if (n <= 0) return []
  const rows = Math.ceil(n / max)
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Chips em linhas de 1 a `max` itens, harmônicas; dentro de cada linha, colunas iguais que ocupam 100% da largura. */
export function ChipRows({ children, max = 3, role, 'aria-label': ariaLabel }: { children: ReactNode; max?: number; role?: string; 'aria-label'?: string }) {
  const items = Children.toArray(children)
  const rows: ReactNode[][] = []
  let at = 0
  for (const size of chipRowSizes(items.length, max)) { rows.push(items.slice(at, at + size)); at += size }
  return (
    <div role={role} aria-label={ariaLabel} className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 [&>*]:w-full [&>*]:min-w-0" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>{row}</div>
      ))}
    </div>
  )
}
