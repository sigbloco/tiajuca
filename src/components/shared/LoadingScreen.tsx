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
const RAYS = 'repeating-conic-gradient(rgb(var(--primary) / 0.13) 0deg 20deg, transparent 20deg 40deg)'

/**
 * Tela de carregando, centralizada: logo do bloco (a última conhecida, guardada no aparelho) com raios na cor do bloco
 * saindo do centro dela, e uma barra embaixo.
 * Com "fillMs", a barra enche de 0 a 100% nesse tempo; sem ele, uma barrinha corre sem parar. "children" entra embaixo.
 */
export function LoadingScreen({ children, fillMs }: { children?: ReactNode; fillMs?: number }) {
  const brand = readBrand()
  useEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="status" aria-live="polite" className="relative flex min-h-screen flex-col items-center justify-center gap-5 overflow-hidden bg-background p-6 text-center">
      <div className="relative h-20 w-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[250vmax] w-[250vmax] shrink-0 animate-[spin_90s_linear_infinite] motion-reduce:animate-none" style={{ background: RAYS }} />
        </div>
        {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="relative h-20 w-20 ring-2 ring-border" />}
      </div>
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
