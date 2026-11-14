import { Children, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Fileira de botões de ação que dividem 100% da largura igualmente. O texto (`<span className="act-label">`) aparece
 * quando cabe em todos; se faltar espaço em algum, TODOS viram só ícones.
 */
export function ActionRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const items = Children.toArray(children).filter(Boolean)
  const n = items.length
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || n === 0) return
    const fit = () => {
      el.removeAttribute('data-icons')
      const over = [...el.children].some((c) => (c as HTMLElement).scrollWidth > (c as HTMLElement).clientWidth + 1)
      if (over) el.setAttribute('data-icons', '')
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  })
  if (n === 0) return null
  return (
    <div ref={ref} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      className={`grid gap-2 [&>*]:w-full [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&[data-icons]_.act-label]:hidden ${className}`}>
      {items}
    </div>
  )
}
