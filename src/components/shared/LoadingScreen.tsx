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

/**
 * Tela de carregando, centralizada: logo do bloco (a última conhecida, guardada no aparelho) e uma barra na cor do bloco.
 * Com "fillMs", a barra enche de 0 a 100% nesse tempo; sem ele, uma barrinha corre sem parar. "children" entra embaixo.
 * Sem animação para quem prefere menos movimento.
 */
export function LoadingScreen({ children, fillMs }: { children?: ReactNode; fillMs?: number }) {
  const brand = readBrand()
  useEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="h-20 w-20 ring-2 ring-border" />}
      <div className="h-2 w-52 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        {fillMs
          ? <div className="h-full w-0 rounded-full bg-primary animate-loading-fill motion-reduce:w-full" style={{ animationDuration: fillMs + 'ms' }} />
          : <div className="h-full w-1/3 rounded-full bg-primary animate-loading-bar motion-reduce:w-full motion-reduce:animate-pulse" />}
      </div>
      <p className="sr-only">Carregando</p>
      {children}
    </div>
  )
}
