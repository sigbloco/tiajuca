import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Regra de layout: uma fileira de botões que não cabe numa linha NÃO deixa um botão sozinho nem desigual embaixo.
 * Cabendo, ficam todos numa linha só; senão, quebram de forma harmônica (4 → 2+2, 6 → 3+3, 5 → 3+2) e cada coluna
 * divide a largura por igual. Ex.: "Pedidos · Produtos · Estoque · Pontos de retirada" vira 2 em cima e 2 embaixo.
 */
export function ButtonRow({ children, className = '', ...aria }: { children: ReactNode; className?: string; role?: string; 'aria-label'?: string }) {
  const items = Children.toArray(children)
  const n = items.length
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(Math.max(1, n))

  const fit = () => {
    const el = ref.current
    if (!el || n === 0) return
    const avail = el.clientWidth
    const prev = el.style.gridTemplateColumns
    let chosen = 1
    for (let c = n; c >= 2; c--) {
      // Colunas que deixariam um botão sozinho na última linha são descartadas (ex.: 3 botões em 2 colunas).
      if (c < n && n % c === 1) continue
      el.style.gridTemplateColumns = `repeat(${c}, max-content)`
      if (el.scrollWidth <= avail + 0.5) { chosen = c; break }
    }
    el.style.gridTemplateColumns = prev
    // Nada coube numa linha sem quebrar o texto: com 3 ou mais botões, divide em colunas iguais (texto quebra dentro do botão),
    // sempre sem deixar um botão sozinho embaixo (5 → 3+2, 4 → 2+2).
    if (chosen === 1 && n >= 3) {
      const gap = 8, minW = 104
      const maxCols = Math.min(n, Math.floor((avail + gap) / (minW + gap)))
      for (let c = maxCols; c >= 2; c--) { if (c < n && n % c === 1) continue; chosen = c; break }
    }
    setCols(chosen)
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  })

  return (
    <div ref={ref} {...aria} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      className={`grid gap-2 [&>*]:w-full [&>*]:min-w-0 ${className}`}>
      {items}
    </div>
  )
}
