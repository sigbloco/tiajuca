import { OrgLogo } from '@/components/shared/OrgLogo'

export interface RaysConfig {
  on?: boolean; count?: number; opacity?: number; rotation?: number; color?: string | null; /** Gira bem devagar. */ animate?: boolean; /** 1 a 20 (4 = uma volta a cada 3 min). */ speed?: number
  /** Contorno em volta da logo (ligado por padrão) e a cor dele (vazio = cor do site). */ outline?: boolean; outlineColor?: string | null
}

/** Raios (como na camiseta): cunhas em SVG (as bordas ficam suavizadas, mesmo girando) num quadrado bem maior que a tela, centrado; quem contém corta o excesso (overflow hidden). */
export function RaysBackdrop({ count = 16, opacity = 100, rotation = 0, color, animate, speed = 4 }: Omit<RaysConfig, 'on'>) {
  const n = Math.max(2, count)
  const period = 360 / n
  const c = color || 'rgb(var(--secondary))'
  const pt = (deg: number) => { const r = ((deg - 90) * Math.PI) / 180; return `${(100 * Math.cos(r)).toFixed(3)} ${(100 * Math.sin(r)).toFixed(3)}` }
  const d = Array.from({ length: n }, (_, i) => {
    const a = rotation + i * period
    return `M0 0 L${pt(a)} A100 100 0 0 1 ${pt(a + period / 2)} Z`
  }).join(' ')
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[260vmax] w-[260vmax] -translate-x-1/2 -translate-y-1/2" style={{ opacity: opacity / 100 }}>
      <svg viewBox="-100 -100 200 200" className={animate ? 'rays-spin h-full w-full' : 'h-full w-full'} shapeRendering="geometricPrecision" style={animate ? { animationDuration: `${720 / Math.min(20, Math.max(1, speed))}s` } : undefined}>
        <path d={d} fill={c} />
      </svg>
    </div>
  )
}

/** Logo no centro dos raios: os raios ficam atrás de um fundo sólido, do contorno (se ligado) e da logo. */
export function LogoWithRays({ rays, backing, name, logoPath, size = 'h-36 w-36' }: { rays?: RaysConfig; backing: string; name?: string | null; logoPath?: string | null; size?: string }) {
  const outline = rays?.outline ?? true
  return (
    <div className={`relative mx-auto ${size}`}>
      {rays?.on && <RaysBackdrop count={rays.count} opacity={rays.opacity} rotation={rays.rotation} color={rays.color} animate={rays.animate} speed={rays.speed} />}
      <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: backing, boxShadow: outline ? `0 0 0 4px ${rays?.outlineColor || 'rgb(var(--secondary))'}` : undefined }} />
      <OrgLogo name={name} logoPath={logoPath} className={`relative mx-auto ${size} object-cover`} />
    </div>
  )
}
