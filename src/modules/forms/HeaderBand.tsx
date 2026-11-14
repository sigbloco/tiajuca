import { useRef, type ReactNode } from 'react'
import { cn } from '@/components/ui/primitives'

export interface HeaderFrame { image_url: string | null; x: number; y: number; zoom: number; height: number }
export const DEFAULT_FRAME: HeaderFrame = { image_url: null, x: 50, y: 50, zoom: 1, height: 104 }
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/**
 * Faixa do cabeçalho do formulário: foto de fundo (desfoque leve, escurecida, degradê de transparente para o vermelho da marca) e a logo por cima.
 * Mesma peça no formulário público e na prévia das configurações; com `onChange` a foto pode ser arrastada dentro da moldura.
 */
export function HeaderBand({ frame, logo, onChange, className }: { frame: HeaderFrame; logo: ReactNode; onChange?: (p: { x: number; y: number }) => void; className?: string }) {
  const drag = useRef<{ cx: number; cy: number; x: number; y: number; w: number; h: number } | null>(null)
  const editable = Boolean(onChange && frame.image_url)
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden rounded-2xl', editable && 'cursor-grab touch-none active:cursor-grabbing', className)}
      style={{ height: frame.height }}
      onPointerDown={editable ? (e) => {
        const r = e.currentTarget.getBoundingClientRect()
        drag.current = { cx: e.clientX, cy: e.clientY, x: frame.x, y: frame.y, w: r.width, h: r.height }
        e.currentTarget.setPointerCapture(e.pointerId)
      } : undefined}
      onPointerMove={editable ? (e) => {
        const d = drag.current
        if (!d) return
        // Arrastar a foto para a direita mostra mais do lado esquerdo dela (posição diminui); com zoom, o mesmo gesto move menos.
        onChange!({ x: clamp(d.x - ((e.clientX - d.cx) / d.w) * 100 / frame.zoom, 0, 100), y: clamp(d.y - ((e.clientY - d.cy) / d.h) * 100 / frame.zoom, 0, 100) })
      } : undefined}
      onPointerUp={editable ? () => { drag.current = null } : undefined}
      onPointerCancel={editable ? () => { drag.current = null } : undefined}
    >
      {frame.image_url && (
        <>
          <img src={frame.image_url} alt="" draggable={false} aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover blur-[1px] brightness-75"
            style={{ objectPosition: `${frame.x}% ${frame.y}%`, transform: `scale(${frame.zoom * 1.03})`, transformOrigin: `${frame.x}% ${frame.y}%` }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-primary/80" />
        </>
      )}
      <div className="pointer-events-none relative">{logo}</div>
    </div>
  )
}
