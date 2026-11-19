import { useEffect, useRef, useState, type ReactNode } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyTheme } from '@/core/theme'
import { readBrand } from '@/modules/auth/AuthLayout'

/** Vale por carga da página: ao recarregar volta a valer; ao navegar dentro do app, não. */
let splashShown = false

/** Na abertura do app, segura a tela de carregando pelo tempo mínimo (padrão 3 s) para dar tempo de ver a logo e a barra encher. */
export function useSplashHold(ms = 3000): boolean {
  const [hold, setHold] = useState(!splashShown)
  useEffect(() => {
    if (!hold) return
    const t = setTimeout(() => { splashShown = true; setHold(false) }, ms)
    return () => clearTimeout(t)
  }, [hold, ms])
  return hold
}

/** Tempo da girada rápida de despedida (a tela de carregando fica esse tempo a mais depois de tudo pronto). */
export const SPIN_OUT_MS = 800

/** Raios que giram devagar atrás da logo e, ao terminar de carregar (finishing), aceleram numa girada rápida. */
function Rays({ finishing }: { finishing: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const fin = useRef(finishing)
  fin.current = finishing
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let angle = 0, speed = 5, last = performance.now(), raf = 0
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50) / 1000
      last = now
      // Devagar (5°/s); ao terminar, sobe rápido até quase duas voltas por segundo.
      speed += ((fin.current ? 700 : 5) - speed) * Math.min(1, dt * (fin.current ? 6 : 2))
      angle = (angle + speed * dt) % 360
      if (ref.current) ref.current.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[250vmax] w-[250vmax]"
      style={{ transform: 'translate(-50%, -50%)', background: 'repeating-conic-gradient(rgb(var(--primary) / 0.13) 0deg 7.5deg, transparent 7.5deg 15deg)' }} />
  )
}

/**
 * Tela de carregando, centralizada: raios na cor do bloco cobrindo a tela toda (giram devagar), logo do bloco
 * (a última conhecida, guardada no aparelho) e uma barra. "finishing" dá a girada rápida de despedida.
 * Com "fillMs", a barra enche de 0 a 100% nesse tempo; sem ele, uma barrinha corre sem parar. "children" entra embaixo.
 * Sem animação para quem prefere menos movimento.
 */
export function LoadingScreen({ children, fillMs, finishing = false }: { children?: ReactNode; fillMs?: number; finishing?: boolean }) {
  const brand = readBrand()
  useEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="status" aria-live="polite" className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden bg-background p-6 text-center">
      <Rays finishing={finishing} />
      {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="relative h-20 w-20 ring-2 ring-border" />}
      <div className="relative h-2 w-52 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        {fillMs
          ? <div className="h-full w-0 rounded-full bg-primary animate-loading-fill motion-reduce:w-full" style={{ animationDuration: fillMs + 'ms' }} />
          : <div className="h-full w-1/3 rounded-full bg-primary animate-loading-bar motion-reduce:w-full motion-reduce:animate-pulse" />}
      </div>
      <p className="sr-only">Carregando</p>
      <div className="relative">{children}</div>
    </div>
  )
}
