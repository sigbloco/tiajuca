import { OrgLogo } from '@/components/shared/OrgLogo'

export interface RaysConfig { on?: boolean; count?: number; opacity?: number; rotation?: number; color?: string | null }

/** Raios (como na camiseta): um gradiente cônico centrado no meio do elemento, bem maior que a tela; quem contém corta o excesso (overflow hidden), então ocupa 100% em qualquer largura. */
export function RaysBackdrop({ count = 16, opacity = 100, rotation = 0, color }: Omit<RaysConfig, 'on'>) {
  const period = 360 / Math.max(2, count)
  const half = period / 2
  const c = color || 'rgb(var(--secondary))'
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[260vmax] w-[260vmax] -translate-x-1/2 -translate-y-1/2"
      style={{ opacity: opacity / 100, background: `repeating-conic-gradient(from ${rotation + half}deg at 50% 50%, ${c} 0deg ${half}deg, transparent ${half}deg ${period}deg)` }} />
  )
}

/** Logo no centro dos raios: os raios ficam atrás de um fundo sólido, do contorno e da logo (a logo pode ter áreas transparentes). */
export function LogoWithRays({ rays, backing, name, logoPath, size = 'h-36 w-36' }: { rays?: RaysConfig; backing: string; name?: string | null; logoPath?: string | null; size?: string }) {
  return (
    <div className={`relative mx-auto ${size}`}>
      {rays?.on && <RaysBackdrop count={rays.count} opacity={rays.opacity} rotation={rays.rotation} color={rays.color} />}
      {/* Fundo sólido + contorno amarelo + um anel da cor do cabeçalho por fora: os raios nunca encostam no contorno nem aparecem pela logo. */}
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: backing, boxShadow: `0 0 0 4px rgb(var(--secondary)), 0 0 0 ${rays?.on ? 10 : 4}px ${rays?.on ? backing : 'transparent'}` }} />
      <OrgLogo name={name} logoPath={logoPath} className={`relative mx-auto ${size} object-cover`} />
    </div>
  )
}
