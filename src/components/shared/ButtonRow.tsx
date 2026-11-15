import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Regra de layout: uma fileira de botões que não cabe numa linha NÃO deixa um botão sozinho nem desigual embaixo.
 * Cabendo, ficam todos numa linha só; senão, quebram de forma harmônica (4 → 2+2, 6 → 3+3, 5 → 3+2) e cada coluna
 * divide a largura por igual. Ex.: "Pedidos · Produtos · Estoque · Pontos de retirada" vira 2 em cima e 2 embaixo.
 */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

export function ButtonRow({ children, className = '', split, ...aria }: { children: ReactNode; className?: string; role?: string; 'aria-label'?: string; 'aria-labelledby'?: string; /** Quando quebra de linha: quantos botões em cada linha (ex.: [2, 3] com 5 botões). Sem isto, linhas cheias e a última completa a largura. */ split?: number[] }) {
  const items = Children.toArray(children)
  const n = items.length
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(Math.max(1, n))
  const changes = useRef({ n, count: 0 })

  const fit = () => {
    const el = ref.current
    if (!el || n === 0) return
    const avail = el.clientWidth
    const prev = el.style.gridTemplateColumns
    // Medir sem os "span" da última linha esticada: senão a medida depende do layout atual e a escolha de colunas fica oscilando (erro #185).
    const kids = Array.from(el.children) as HTMLElement[]
    const spansSaved = kids.map((k) => k.style.gridColumn)
    kids.forEach((k) => { k.style.gridColumn = 'auto' })
    // Colunas iguais: cada coluna precisa caber o botão MAIS LARGO com o padding lateral dele (nunca espremer o texto nem cortar). Sem caber, desce para menos colunas (até um por linha).
    el.style.gridTemplateColumns = `repeat(${n}, max-content)`
    const maxW = Math.max(...kids.map((k) => k.getBoundingClientRect().width))
    const gap = 8
    let chosen = 1
    for (let c = n; c >= 2; c--) {
      // Colunas que deixariam um botão sozinho na última linha são descartadas (5 → 3+2), menos com 3 botões (2 + 1 esticado).
      if (c < n && n % c === 1 && n !== 3) continue
      if (c * maxW + (c - 1) * gap <= avail + 0.5) { chosen = c; break }
    }
    el.style.gridTemplateColumns = prev
    kids.forEach((k, i) => { k.style.gridColumn = spansSaved[i] })
    // Com linhas combinadas (split) e sem caber numa linha só, vale a combinação pedida (ex.: 2 + 3).
    if (split && chosen < n && split.reduce((x, y) => x + y, 0) === n) chosen = Math.max(...split)
    // Trava de segurança: se a escolha insistir em mudar (oscilação), para de mudar em vez de travar a página.
    if (changes.current.n !== n) changes.current = { n, count: 0 }
    if (chosen !== cols) { if (changes.current.count > 6) return; changes.current.count++ }
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

  // Linhas: tudo numa linha só, ou as indicadas em `split`, ou linhas cheias com a última esticada até a borda (nada fica pequeno e desigual).
  const rows: number[] = cols >= n ? [n] : split && split.reduce((a, b) => a + b, 0) === n ? split : [...Array(Math.floor(n / cols)).fill(cols), ...(n % cols ? [n % cols] : [])]
  const total = rows.reduce((l, r) => (l * r) / gcd(l, r), 1)
  const spans: number[] = rows.flatMap((r) => Array(r).fill(total / r))
  const uniform = rows.every((r) => r === rows[0])
  return (
    <div ref={ref} {...aria} style={{ gridTemplateColumns: uniform ? `repeat(${rows[0]}, minmax(0, 1fr))` : `repeat(${total}, minmax(0, 1fr))` }}
      className={`grid gap-2 [&>*]:w-full [&>*]:min-w-0 ${className}`}>
      {uniform ? items : items.map((it, i) => <div key={i} style={{ gridColumn: `span ${spans[i]}` }} className="flex [&>*]:w-full [&>*]:min-w-0">{it}</div>)}
    </div>
  )
}
