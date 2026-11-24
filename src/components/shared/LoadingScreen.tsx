import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyTheme } from '@/core/theme'
import { readBrand } from '@/modules/auth/AuthLayout'
import { RaysBackdrop } from '@/modules/site/Rays'

/** Tempo da barra: de 0 a 100 % em no máximo 2 s, uma animação só. */
export const LOADING_MS = 2000

// A logo guardada começa a baixar já na abertura do app (fica no cache quando a tela de carregando aparecer).
if (typeof Image !== 'undefined') {
  const logo = readBrand()?.logo_path
  if (logo) new Image().src = logo
}

/**
 * Um "carregamento" só, mesmo quando uma tela de carregando dá lugar a outra (rotas → moldura do app):
 * a barra continua de onde estava em vez de recomeçar. Depois de um tempo sem nenhuma na tela, o próximo começa do 0.
 */
let started: number | null = null
let mounted = 0
let lastGone = 0
const HANDOFF_MS = 400
function loadingStart(): number {
  const now = performance.now()
  if (started === null || (mounted === 0 && now - lastGone > HANDOFF_MS)) started = now
  return started
}

/** Vale por carga da página: ao recarregar volta a valer; ao navegar dentro do app, não. */
let splashShown = false

/** Na abertura do app, segura a tela de carregando até a barra chegar a 100 % (no máximo 2 s desde que ela apareceu). */
export function useSplashHold(ms = LOADING_MS): boolean {
  const [hold, setHold] = useState(!splashShown)
  useEffect(() => {
    if (!hold) return
    const left = Math.max(0, loadingStart() + ms - performance.now())
    const t = setTimeout(() => { splashShown = true; setHold(false) }, left)
    return () => clearTimeout(t)
  }, [hold, ms])
  return hold
}

/** Contorno branco em volta do texto (oito direções), para proteger a leitura sobre os raios. */
const STROKE = { textShadow: '2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff, 1.5px 1.5px #fff, -1.5px -1.5px #fff, 1.5px -1.5px #fff, -1.5px 1.5px #fff' }

/** Progresso de 0 a 100, linear, a partir do começo do carregamento. A barra e o número usam o mesmo valor (andam juntos). */
function useProgress(): number {
  const [n, setN] = useState(() => Math.min(100, ((performance.now() - loadingStart()) / LOADING_MS) * 100))
  useEffect(() => {
    mounted++
    const t0 = loadingStart()
    let raf = 0
    const tick = (now: number) => {
      const v = Math.min(100, ((now - t0) / LOADING_MS) * 100)
      setN(v)
      if (v < 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); mounted--; lastGone = performance.now() }
  }, [])
  return n
}

/**
 * Tela de carregando, centralizada: logo do bloco (a última conhecida, guardada no aparelho) com raios na cor do bloco
 * saindo do centro dela, e uma barra embaixo que enche de 0 a 100 % em 2 s. "children" entra embaixo.
 */
export function LoadingScreen({ children }: { children?: ReactNode }) {
  const brand = readBrand()
  useLayoutEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, [])
  const pct = useProgress()
  return (
    <div role="status" aria-live="polite" className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden p-6 text-center" style={{ backgroundColor: 'rgb(var(--secondary))' }}>
      {/* Fundo na cor secundária (100%) e 9 raios na cor principal, em SVG (bordas lisas), saindo do centro da logo. */}
      <div className="relative h-20 w-20">
        <RaysBackdrop count={9} opacity={100} color="rgb(var(--primary))" animate speed={8} />
        {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="relative h-20 w-20" />}
      </div>
      <div className="relative h-3 w-52 overflow-hidden rounded-full bg-white p-0.5 shadow-sm" aria-hidden>
        <div className="h-full rounded-full bg-primary motion-reduce:!w-full" style={{ width: `${pct}%` }} />
      </div>
      {/* Texto escuro com contorno branco, para continuar legível sobre os raios. */}
      <p className="relative font-display text-lg font-extrabold text-[#1c1917]" style={STROKE}>
        Carregando <span className="tabular-nums">{Math.floor(pct)}%</span>
      </p>
      <div className="relative">{children}</div>
    </div>
  )
}
