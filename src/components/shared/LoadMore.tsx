import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/primitives'

/** Lista progressiva: mostra `step` itens e um botão "Ver mais N" (N = o que falta, no máximo `step`). */
export function useProgressive<T>(items: T[], step = 5, resetKey?: unknown) {
  const [shown, setShown] = useState(step)
  useEffect(() => setShown(step), [resetKey, step])
  const left = Math.max(0, items.length - shown)
  return {
    visible: items.slice(0, shown),
    /** Mostra tudo (ex.: depois de adicionar um item no fim da lista, para ele não ficar escondido). */
    showAll: () => setShown(Number.MAX_SAFE_INTEGER),
    left,
    button: left > 0
      ? <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShown((s) => s + step)}>Ver mais {Math.min(step, left)}</Button>
      : null,
  }
}

/** Atalho em componente, para listas dentro de loops (onde hooks não podem ser usados). */
export function ProgressiveList<T>({ items, render, step = 5, resetKey }: { items: T[]; render: (item: T, index: number) => React.ReactNode; step?: number; resetKey?: unknown }) {
  const { visible, button } = useProgressive(items, step, resetKey)
  return <>{visible.map(render)}{button}</>
}
