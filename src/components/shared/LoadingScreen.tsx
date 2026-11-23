import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyTheme } from '@/core/theme'
import { readBrand } from '@/modules/auth/AuthLayout'
import { RaysBackdrop } from '@/modules/site/Rays'

/** A logo guardada começa a baixar já na abertura do app; a tela de carregando só começa (logo, raios, barra e contagem) quando ela estiver pronta (ou passados 2,5 s). */
export const brandReady: Promise<void> = new Promise((resolve) => {
  const logo = readBrand()?.logo_path
  if (!logo || typeof Image === 'undefined') { resolve(); return }
  const img = new Image()
  img.onload = img.onerror = () => resolve()
  img.src = logo
  setTimeout(resolve, 2500)
})

/** Vale por carga da página: ao recarregar volta a valer; ao navegar dentro do app, não. */
let splashShown = false

/** Na abertura do app, segura a tela de carregando pelo tempo mínimo (padrão 3 s) para dar tempo de ver a logo e a barra encher. */
export function useSplashHold(ms = 3000): boolean {
  const [hold, setHold] = useState(!splashShown)
  useEffect(() => {
    if (!hold) return
    let t: ReturnType<typeof setTimeout> | undefined
    let on = true
    // O tempo mínimo conta a partir de a logo estar pronta.
    void brandReady.then(() => { if (on) t = setTimeout(() => { splashShown = true; setHold(false) }, ms) })
    return () => { on = false; clearTimeout(t) }
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
  useLayoutEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, [])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let on = true
    void brandReady.then(() => { if (on) setReady(true) })
    return () => { on = false }
  }, [])
  const pct = useCountUp(ready ? fillMs : undefined)
  // Até a logo estar pronta, só o fundo: nada aparece pela metade e a barra só começa a encher depois.
  if (!ready) return <div role="status" aria-live="polite" className="min-h-screen" style={{ backgroundColor: 'rgb(var(--secondary))' }}><p className="sr-only">Carregando</p></div>
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
