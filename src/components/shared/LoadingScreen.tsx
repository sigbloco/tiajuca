import { useEffect, useState, type ReactNode } from 'react'
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

/** Raios (9) saindo do centro da logo e cobrindo a tela toda, girando devagar. Sem giro para quem prefere menos movimento. */
const RAYS = 'repeating-conic-gradient(rgb(var(--primary)) 0deg 20deg, transparent 20deg 40deg)'

/** Contorno branco em volta do texto (oito direções), para proteger a leitura sobre os raios. */
const STROKE = { textShadow: '2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff, 1.5px 1.5px #fff, -1.5px -1.5px #fff, 1.5px -1.5px #fff, -1.5px 1.5px #fff' }

/** Número de 0 a 100 no mesmo ritmo da barra (linear, em "ms"). Sem "ms", fica em 0. */
function useCountUp(ms?: number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ms) return
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const v = Math.min(100, Math.floor(((now - t0) / ms) * 100))
      setN(v)
      if (v < 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ms])
  return n
}

/**
 * Tela de carregando, centralizada: logo do bloco (a última conhecida, guardada no aparelho) com raios na cor do bloco
 * saindo do centro dela, e uma barra embaixo.
 * Com "fillMs", a barra enche de 0 a 100% nesse tempo; sem ele, uma barrinha corre sem parar. "children" entra embaixo.
 */
export function LoadingScreen({ children, fillMs }: { children?: ReactNode; fillMs?: number }) {
  const brand = readBrand()
  useEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const pct = useCountUp(fillMs)
  return (
    <div role="status" aria-live="polite" className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden bg-background p-6 text-center">
      <div className="relative h-20 w-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[250vmax] w-[250vmax] shrink-0 animate-[spin_90s_linear_infinite] motion-reduce:animate-none" style={{ background: RAYS }} />
        </div>
        {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="relative h-20 w-20 ring-4 ring-white" />}
      </div>
      <div className="relative h-3 w-52 overflow-hidden rounded-full bg-white p-0.5 shadow-sm" aria-hidden>
        {fillMs
          ? <div className="h-full w-0 rounded-full bg-primary animate-loading-fill motion-reduce:w-full" style={{ animationDuration: fillMs + 'ms' }} />
          : <div className="h-full w-1/3 rounded-full bg-primary animate-loading-bar motion-reduce:w-full motion-reduce:animate-pulse" />}
      </div>
      {/* Texto escuro com contorno branco, para continuar legível sobre os raios. */}
      <p className="relative font-display text-lg font-extrabold text-[#1c1917]" style={STROKE}>
        Carregando{fillMs ? <> <span className="tabular-nums">{pct}%</span></> : null}
      </p>
      <div className="relative">{children}</div>
    </div>
  )
}
