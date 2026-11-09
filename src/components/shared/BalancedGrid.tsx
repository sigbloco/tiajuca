import { Children, type ReactNode } from 'react'

/** Quantas colunas deixam a última linha mais cheia (4 → 2+2, 5 → 3+2, 6 → 3+3, 8 → 2×4…). */
export function balancedCols(n: number, max = 3): number {
  if (n <= 1) return 1
  let best = 1
  let bestScore = -1
  for (let c = Math.min(max, n); c >= 2; c--) {
    const last = n % c === 0 ? c : n % c
    // Última linha cheia é o melhor; depois a mais cheia possível; empate: mais colunas (menos linhas).
    const score = (last === c ? 1000 : 0) + last * 10 + c
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

// Larguras fixas (o Tailwind precisa enxergar as classes inteiras). A última linha, se incompleta, fica centralizada.
const W2 = 'sm:w-[calc((100%-0.75rem)/2)]'
const L2 = 'lg:w-[calc((100%-0.75rem)/2)]'
const L3 = 'lg:w-[calc((100%-1.5rem)/3)]'

/**
 * Caixas distribuídas de forma harmônica: nunca deixa uma caixa sozinha numa linha quando dá para evitar.
 * Celular: uma por linha; telas maiores: o número de colunas que fecha melhor as linhas.
 */
export function BalancedGrid({ children, max = 3, className = '' }: { children: ReactNode; max?: 2 | 3; className?: string }) {
  const items = Children.toArray(children)
  const cols = balancedCols(items.length, max)
  const itemCls = cols >= 3 ? `w-full ${W2} ${L3}` : cols === 2 ? `w-full ${W2} ${L2}` : 'w-full'
  return (
    <div className={`flex flex-wrap justify-center gap-3 ${className}`}>
      {items.map((c, i) => <div key={i} className={`flex min-w-0 [&>*]:w-full ${itemCls}`}>{c}</div>)}
    </div>
  )
}
