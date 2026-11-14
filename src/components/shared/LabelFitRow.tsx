import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Fileira de botões em 100% da largura, colunas iguais, com ícone + texto. Havendo espaço, TODOS mostram o texto;
 * senão, todos mostram só o ícone. Os textos dos botões vão num `<span className="fit-label">`.
 */
export function LabelFitRow({ children, className = '', ...aria }: { children: ReactNode; className?: string; role?: string; 'aria-label'?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.dataset.labels = 'on'
    const over = [...el.children].some((c) => c.scrollWidth > c.clientWidth + 0.5)
    el.dataset.labels = over ? 'off' : 'on'
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  })
  return (
    <div ref={ref} {...aria} data-labels="on"
      className={`grid grid-flow-col auto-cols-fr gap-2 [&>*]:w-full [&>*]:min-w-0 [&[data-labels=off]_.fit-label]:hidden ${className}`}>
      {children}
    </div>
  )
}
