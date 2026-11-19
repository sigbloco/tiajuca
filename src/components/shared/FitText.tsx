import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
export function FitBox({ children, className, min = 9, max = 44, align = 'center', onFit, forceSize }: { children: ReactNode; className?: string; min?: number; max?: number; /** Posição vertical do texto na área: no centro, no topo ou embaixo. */ align?: 'center' | 'start' | 'end'; /** Avisa a maior fonte que coube (para várias caixas usarem a mesma). */ onFit?: (size: number) => void; /** Se dada, o texto usa no máximo esta fonte (a menor entre as caixas). */ forceSize?: number }) {
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
      const best = Math.floor(lo)
      onFit?.(best)
      t.style.fontSize = `${forceSize ? Math.min(best, forceSize) : best}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(w)
    return () => ro.disconnect()
  }, [children, min, max, forceSize]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={wrap} className={cn('absolute inset-0 flex', align === 'end' ? 'items-end' : align === 'start' ? 'items-start' : 'items-center')}>
      <span ref={text} className={cn('block w-full min-w-0 break-normal [overflow-wrap:normal] leading-none', className)}>{children}</span>
    </div>
  )
}

/** Rótulo de uma linha: se o texto completo não coubesse nem com a fonte mínima, usa a forma curta (ex.: "Frequência" → "Freq."). */
export function FitLabel({ full, short, className, minFull = 10 }: { full: string; short: string; className?: string; /** Menor fonte (px) aceita para o texto completo. */ minFull?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(full)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const decide = () => {
      const cs = getComputedStyle(el)
      const ctx = document.createElement('canvas').getContext('2d')
      if (!ctx) return
      ctx.font = `${cs.fontWeight} ${minFull}px ${cs.fontFamily}`
      const avail = el.clientWidth - 8 // FitText tem 4px de folga de cada lado
      setText(ctx.measureText(full).width <= avail ? full : short)
    }
    decide()
    const ro = new ResizeObserver(decide)
    ro.observe(el)
    return () => ro.disconnect()
  }, [full, short, minFull])
  return <div ref={ref} className="min-w-0"><FitText min={minFull} className={className}>{text}</FitText></div>
}
