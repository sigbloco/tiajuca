import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/components/ui/primitives'

/**
 * Trilha "A • B • C" alinhada à esquerda. Se quebrar de linha, o "•" que ficaria sozinho no fim da linha de cima some
 * (o item seguinte foi para a de baixo).
 */
export function BulletTrail({ items, className }: { items: string[]; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const fix = () => box.querySelectorAll<HTMLElement>('[data-bullet]').forEach((b) => {
      const next = b.nextElementSibling as HTMLElement | null
      b.style.visibility = next && next.offsetTop > b.offsetTop + 2 ? 'hidden' : 'visible'
    })
    fix()
    const ro = new ResizeObserver(fix)
    ro.observe(box)
    return () => ro.disconnect()
  })
  return (
    <span ref={ref} className={cn('flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-left', className)}>
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className="contents">
          {i > 0 && <span aria-hidden data-bullet>•</span>}
          <span>{t}</span>
        </span>
      ))}
    </span>
  )
}
