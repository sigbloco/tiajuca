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
  return <span ref={ref} className={cn('block min-w-0 overflow-hidden px-1', className)}>{children}</span>
}

/** Rótulo de aba/botão: palavra única diminui a fonte até caber (nunca quebra no meio); mais de uma palavra pode quebrar de linha normalmente. */
export function FitWord({ children }: { children: string }) {
  return /\s/.test(children.trim()) ? <>{children}</> : <FitText>{children}</FitText>
}

/**
 * Texto que ocupa a MAIOR fonte possível dentro da área que o pai (position: relative, com altura própria) oferece:
 * quebra só entre palavras (nunca no meio) e a fonte cresce até a largura e a altura acabarem. Centralizado na vertical.
 */
export function FitBox({ children, className, min = 9, max = 44 }: { children: ReactNode; className?: string; min?: number; max?: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const w = wrap.current, t = text.current
    if (!w || !t) return
    const fit = () => {
      let lo = min, hi = max
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2
        t.style.fontSize = `${mid}px`
        if (t.scrollWidth <= w.clientWidth + 0.5 && t.scrollHeight <= w.clientHeight + 0.5) lo = mid
        else hi = mid
      }
      t.style.fontSize = `${lo}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(w)
    return () => ro.disconnect()
  }, [children, min, max])
  return (
    <div ref={wrap} className="absolute inset-0 flex items-center">
      <span ref={text} className={cn('block w-full min-w-0 break-normal [overflow-wrap:normal] leading-[1.05]', className)}>{children}</span>
    </div>
  )
}
