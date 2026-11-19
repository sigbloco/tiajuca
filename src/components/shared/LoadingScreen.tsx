import { useEffect, useState, type ReactNode } from 'react'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { applyTheme } from '@/core/theme'
import { readBrand } from '@/modules/auth/AuthLayout'

/** Na primeira abertura do app (por aba), segura a tela de carregando por um instante, para dar tempo de ver a logo e a barrinha. */
export function useSplashHold(ms = 900): boolean {
  const [hold, setHold] = useState(() => { try { return sessionStorage.getItem('sigbloco:splash') !== '1' } catch { return false } })
  useEffect(() => {
    if (!hold) return
    const t = setTimeout(() => { try { sessionStorage.setItem('sigbloco:splash', '1') } catch { /* ignorar */ } setHold(false) }, ms)
    return () => clearTimeout(t)
  }, [hold, ms])
  return hold
}

/**
 * Tela de carregando, centralizada: logo do bloco (a última conhecida, guardada no aparelho) e uma barrinha correndo na cor do bloco.
 * `children` entra embaixo (ex.: a saída quando demora demais). Sem animação para quem prefere menos movimento.
 */
export function LoadingScreen({ children }: { children?: ReactNode }) {
  const brand = readBrand()
  useEffect(() => { if (brand?.theme) applyTheme(brand.theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-6 text-center">
      {brand && <OrgLogo name={brand.name} logoPath={brand.logo_path} className="h-20 w-20 ring-2 ring-border" />}
      <div className="h-2 w-52 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        <div className="h-full w-1/3 rounded-full bg-primary animate-loading-bar motion-reduce:w-full motion-reduce:animate-pulse" />
      </div>
      <p className="sr-only">Carregando</p>
      {children}
    </div>
  )
}
