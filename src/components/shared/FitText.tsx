import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/components/ui/primitives'

/**
 * Palavra que nunca quebra no meio: se não couber na largura, a fonte diminui até caber
 * (mínimo 9px; só em último caso quebra em duas linhas, separando por sílaba com hífen).
 */
export function FitText({ children, className, min = 9 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ''
      el.style.whiteSpace = 'nowrap'
      const base = parseFloat(getComputedStyle(el).fontSize)
      let size = base
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) { size -= 0.5; el.style.fontSize = `${size}px` }
      if (el.scrollWidth > el.clientWidth + 0.5) { el.style.whiteSpace = 'normal'; el.style.hyphens = 'auto'; el.lang = 'pt-BR' }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, min])
  return <span ref={ref} className={cn('block min-w-0 overflow-hidden', className)}>{children}</span>
}

/** Rótulo de aba/botão: palavra única diminui a fonte até caber (nunca quebra no meio); mais de uma palavra pode quebrar de linha normalmente. */
export function FitWord({ children }: { children: string }) {
  return /\s/.test(children.trim()) ? <>{children}</> : <FitText>{children}</FitText>
}
