import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/primitives'

/** Páginas visíveis: sempre a primeira, a última e a vizinhança da atual (null = "…"). */
function pagesToShow(page: number, total: number): (number | null)[] {
  const keep = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

/** Navegação por página: ‹ 1 2 3 4 ›. Some quando cabe numa página só. */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      {pagesToShow(page, pages).map((p, i) => p === null
        ? <span key={`e${i}`} aria-hidden className="px-1 text-muted-foreground">…</span>
        : <Button key={p} type="button" size="icon" variant={p === page ? 'default' : 'outline'} className="h-9 w-9" aria-label={`Página ${p}`} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</Button>)}
      <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </nav>
  )
}
