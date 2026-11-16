import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/components/ui/primitives'

/**
 * Trilha "A • B • C" alinhada à esquerda. Se quebrar de linha, o "•" que ficaria sozinho no fim da linha de cima some
 * (o item seguinte foi para a de baixo).
 * Com `maxLines`, o caminho longo (mais de 3 itens) mostra o primeiro e os dois últimos, com "•••" no lugar do meio.
 */
export function BulletTrail({ items, className, maxLines }: { items: string[]; className?: string; maxLines?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [stage, setStage] = useState(0) // 0 = tudo · 1 = primeiro e dois últimos · 2 = primeiro e último
  const width = useRef(0)
  const key = items.join('|')
  // Caminho novo ou largura nova: tenta mostrar inteiro de novo.
  useEffect(() => { setStage(0) }, [key])
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const ro = new ResizeObserver(() => { if (Math.abs(box.clientWidth - width.current) > 1) { width.current = box.clientWidth; setStage(0) } })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    // Altura de uma linha: a do texto (nunca menos que o tamanho da fonte).
    const cs = getComputedStyle(box)
    const lh = Math.max(parseFloat(cs.lineHeight) || 0, (parseFloat(cs.fontSize) || 14) * 1.2)
    if (maxLines && box.offsetHeight > lh * maxLines + 4) {
      if (stage === 0 && items.length > 3) { setStage(1); return }
      if (stage <= 1 && items.length > 2) { setStage(2); return }
    }
    box.querySelectorAll<HTMLElement>('[data-bullet]').forEach((b) => {
      const next = b.nextElementSibling as HTMLElement | null
      b.style.visibility = next && next.offsetTop > b.offsetTop + 2 ? 'hidden' : 'visible'
    })
  })
  const shown = stage >= 2 && items.length > 2 ? [items[0], '•••', items[items.length - 1]] : stage >= 1 && items.length > 3 ? [items[0], '•••', ...items.slice(-2)] : items
  return (
    <span ref={ref} className={cn('flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-left', className)}>
      {shown.map((t, i) => (
        <span key={`${t}-${i}`} className="contents">
          {i > 0 && <span aria-hidden data-bullet>•</span>}
          <span aria-label={t === '•••' ? 'Itens do meio do caminho' : undefined}>{t}</span>
        </span>
      ))}
    </span>
  )
}
