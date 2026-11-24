import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Regra de layout: uma fileira de botões que não cabe numa linha NÃO deixa um botão sozinho nem desigual embaixo.
 * Cabendo, ficam todos numa linha só; senão, quebram de forma harmônica (4 → 2+2, 6 → 3+3, 5 → 3+2 ou 2+3) e cada
 * linha divide a largura por igual. Ex.: "Pedidos · Produtos · Estoque · Pontos de retirada" vira 2 em cima e 2 embaixo.
 */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * Arranjos possíveis, do preferido ao último recurso: tudo numa linha; depois k linhas equilibradas (tamanhos que diferem
 * no máximo em 1), com as linhas maiores em cima e, em seguida, as menores em cima; por fim, um por linha.
 * Linha de um botão só, abaixo de linhas maiores, é descartada (menos com 3 botões: 2 + 1 esticado).
 */
export function rowCandidates(n: number): number[][] {
  const out: number[][] = []
  for (let k = 1; k <= n; k++) {
    const base = Math.floor(n / k)
    const extra = n % k
    const desc: number[] = [...Array<number>(extra).fill(base + 1), ...Array<number>(k - extra).fill(base)]
    if (k < n && desc.includes(1) && n !== 3) continue
    out.push(desc)
    if (extra && n !== 3) out.push([...desc].reverse())
  }
  return out
}

/** Cada linha divide a largura por igual: cabe quando o botão mais largo DA LINHA cabe na fatia dela. */
export function rowsFit(rows: number[], widths: number[], avail: number, gap: number): boolean {
  let i = 0
  for (const r of rows) {
    const maxW = Math.max(...widths.slice(i, i + r))
    if (r * maxW + (r - 1) * gap > avail + 0.5) return false
    i += r
  }
  return true
}

/** O primeiro arranjo que cabe (um por linha, se nenhum couber). */
export function pickRows(widths: number[], avail: number, gap: number): number[] {
  const n = widths.length
  return rowCandidates(n).find((rows) => rowsFit(rows, widths, avail, gap)) ?? Array<number>(n).fill(1)
}

/**
 * Largura natural de um botão. Rótulo com versões mais curtas (`FitChoice`) conta pela versão mais curta: é a que ele
 * mostra quando a coluna aperta, então não deve empurrar a fileira para menos colunas.
 */
function naturalWidth(k: HTMLElement): number {
  const w = k.getBoundingClientRect().width
  const label = k.querySelector<HTMLElement>('[data-fit-choice]')
  const probes = Array.from(k.querySelectorAll<HTMLElement>('[data-fit-probe]'))
  if (!label || probes.length === 0) return w
  return w - label.getBoundingClientRect().width + Math.min(...probes.map((p) => p.getBoundingClientRect().width))
}

export function ButtonRow({ children, className = '', split, ...aria }: { children: ReactNode; className?: string; role?: string; 'aria-label'?: string; 'aria-labelledby'?: string; /** Quando quebra de linha: quantos botões em cada linha (ex.: [2, 3] com 5 botões). Sem isto, o primeiro arranjo harmônico que cabe. */ split?: number[] }) {
  const items = Children.toArray(children)
  const n = items.length
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState(String(Math.max(1, n)))
  const changes = useRef({ n, count: 0 })

  const fit = () => {
    const el = ref.current
    if (!el || n === 0) return
    const avail = el.clientWidth
    const prev = el.style.gridTemplateColumns
    // Medir sem os "span" das linhas: senão a medida depende do layout atual e a escolha fica oscilando (erro #185).
    const kids = Array.from(el.children) as HTMLElement[]
    const spansSaved = kids.map((k) => k.style.gridColumn)
    kids.forEach((k) => { k.style.gridColumn = 'auto' })
    // Cada botão na largura natural, com o padding lateral dele (nunca espremer o texto nem cortar).
    el.style.gridTemplateColumns = `repeat(${n}, max-content)`
    const widths = kids.map(naturalWidth)
    el.style.gridTemplateColumns = prev
    kids.forEach((k, i) => { k.style.gridColumn = spansSaved[i] })
    const gap = 8
    let rows = pickRows(widths, avail, gap)
    // Com linhas combinadas (split) e sem caber numa linha só, vale a combinação pedida (ex.: 2 + 3).
    if (split && rows.length > 1 && split.reduce((x, y) => x + y, 0) === n) rows = split
    const chosen = rows.join(',')
    // Trava de segurança: se a escolha insistir em mudar (oscilação), para de mudar em vez de travar a página.
    if (changes.current.n !== n) changes.current = { n, count: 0 }
    if (chosen !== layout) { if (changes.current.count > 6) return; changes.current.count++ }
    setLayout(chosen)
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  })

  // Linhas: o arranjo escolhido (enquanto a quantidade de botões não muda; senão, tudo numa linha até medir de novo).
  const parsed = layout.split(',').map(Number)
  const rows: number[] = n > 0 && parsed.reduce((a, b) => a + b, 0) === n ? parsed : [Math.max(1, n)]
  const total = rows.reduce((l, r) => (l * r) / gcd(l, r), 1)
  const spans: number[] = rows.flatMap((r) => Array<number>(r).fill(total / r))
  const uniform = rows.every((r) => r === rows[0])
  return (
    <div ref={ref} {...aria} style={{ gridTemplateColumns: uniform ? `repeat(${rows[0]}, minmax(0, 1fr))` : `repeat(${total}, minmax(0, 1fr))` }}
      className={`grid gap-2 [&>*]:w-full [&>*]:min-w-0 ${className}`}>
      {uniform ? items : items.map((it, i) => <div key={i} style={{ gridColumn: `span ${spans[i]}` }} className="flex [&>*]:w-full [&>*]:min-w-0">{it}</div>)}
    </div>
  )
}
