import { useEffect, useState, type ReactNode } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyTheme } from '@/core/theme'
import { readBrand } from '@/modules/auth/AuthLayout'
import { RaysBackdrop } from '@/modules/site/Rays'

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
    <div role="status" aria-live="polite" className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden p-6 text-center" style={{ backgroundColor: 'rgb(var(--secondary))' }}>
      {/* Fundo na cor secundária (100%) e 9 raios na cor principal, em SVG (bordas lisas), saindo do centro da logo. */}
      <div className="relative h-20 w-20">
        <RaysBackdrop count={9} opacity={100} color="rgb(var(--primary))" animate speed={8} />
        {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="relative h-20 w-20" />}
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
