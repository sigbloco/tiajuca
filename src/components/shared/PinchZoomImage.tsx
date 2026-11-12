import { useRef, useState } from 'react'

/**
 * Foto com zoom de pinça (dois dedos), arraste quando ampliada e toque duplo para voltar.
 * É o único lugar do app onde o zoom é permitido; o resto da página não amplia.
 */
export function PinchZoomImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const box = useRef<HTMLDivElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef({ dist: 0, s: 1, x: 0, y: 0, cx: 0, cy: 0 })
  const lastTap = useRef(0)

  const clamp = (s: number, x: number, y: number) => {
    const ns = Math.min(5, Math.max(1, s))
    const r = box.current?.getBoundingClientRect()
    const mx = r ? (r.width * (ns - 1)) / 2 : 0, my = r ? (r.height * (ns - 1)) / 2 : 0
    return ns === 1 ? { s: 1, x: 0, y: 0 } : { s: ns, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  const snapshot = () => {
    const [a, b] = [...pts.current.values()]
    start.current = { ...start.current, s: t.s, x: t.x, y: t.y, dist: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, cx: a.x, cy: a.y }
  }
  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    snapshot()
    if (pts.current.size === 1 && e.pointerType === 'touch') {
      const now = Date.now()
      if (now - lastTap.current < 300) setT((c) => (c.s > 1 ? { s: 1, x: 0, y: 0 } : clamp(2.5, 0, 0)))
      lastTap.current = now
    }
  }
  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [a, b] = [...pts.current.values()]
    if (b && start.current.dist > 0) setT(clamp(start.current.s * (Math.hypot(a.x - b.x, a.y - b.y) / start.current.dist), start.current.x, start.current.y))
    else if (!b && start.current.s > 1) setT(clamp(start.current.s, start.current.x + a.x - start.current.cx, start.current.y + a.y - start.current.cy))
  }
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); snapshot() }

  return (
    <div ref={box} className="overflow-hidden rounded-xl" style={{ touchAction: t.s > 1 ? 'none' : 'pan-y' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={src} alt={alt} draggable={false} className={className}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: pts.current.size ? 'none' : 'transform .15s' }} />
    </div>
  )
}
