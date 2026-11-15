import { OrgLogo } from '@/components/shared/OrgLogo'

export interface RaysConfig { on?: boolean; count?: number; opacity?: number; rotation?: number; color?: string | null; /** Gira bem devagar. */ animate?: boolean }

/** Raios (como na camiseta): um gradiente cônico centrado no meio do elemento, bem maior que a tela; quem contém corta o excesso (overflow hidden), então ocupa 100% em qualquer largura. */
export function RaysBackdrop({ count = 16, opacity = 100, rotation = 0, color, animate }: Omit<RaysConfig, 'on'>) {
  const period = 360 / Math.max(2, count)
  const half = period / 2
  const c = color || 'rgb(var(--secondary))'
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[260vmax] w-[260vmax] -translate-x-1/2 -translate-y-1/2" style={{ opacity: opacity / 100 }}>
      <div className={animate ? 'rays-spin h-full w-full' : 'h-full w-full'}
        style={{ background: `repeating-conic-gradient(from ${rotation + half}deg at 50% 50%, ${c} 0deg ${half}deg, transparent ${half}deg ${period}deg)` }} />
    </div>
  )
}

/** Logo no centro dos raios: os raios ficam atrás de um fundo sólido, do contorno e da logo (a logo pode ter áreas transparentes). */
export function LogoWithRays({ rays, backing, name, logoPath, size = 'h-36 w-36' }: { rays?: RaysConfig; backing: string; name?: string | null; logoPath?: string | null; size?: string }) {
  return (
    <div className={`relative mx-auto ${size}`}>
      {rays?.on && <RaysBackdrop count={rays.count} opacity={rays.opacity} rotation={rays.rotation} color={rays.color} animate={rays.animate} />}
      {/* Fundo sólido e um contorno só: os raios ficam atrás da logo e do contorno, sem aparecer por áreas transparentes da logo. */}
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: backing, boxShadow: '0 0 0 4px rgb(var(--secondary))' }} />
      <OrgLogo name={name} logoPath={logoPath} className={`relative mx-auto ${size} object-cover`} />
    </div>
  )
}
