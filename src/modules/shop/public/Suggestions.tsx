import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'
import { imageUrl } from '../admin/service'
import type { StoreProduct } from '../cart'
import { Price } from './Price'
import { useStore } from './StoreContext'

/** Meta mínima: só aparece quando a Direção preencheu o mínimo do produto. */
export function MinUnitsBar({ product }: { product: StoreProduct }) {
  const min = product.min_units
  if (!min) return null
  const done = product.confirmed_units ?? 0
  const reached = done >= min
  return (
    <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(done, min)} aria-label="Unidades pagas até o mínimo para produzir"
        className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((done / min) * 100))}%` }} />
      </div>
      <p><strong>{done} de {min}</strong> unidades pagas. {reached
        ? 'Mínimo atingido, a produção já pode começar.'
        : `A produção só começa quando chegarmos a ${min}, e o prazo conta a partir daí.`}</p>
    </div>
  )
}

/** Sugestões pequenas escolhidas no painel. `from` = produtos cujas sugestões entram; `exclude` = ids que não repetem. */
export function SuggestedProducts({ from, exclude }: { from: StoreProduct[]; exclude: string[] }) {
  const { store, isMember, basePath } = useStore()
  const ids = [...new Set(from.flatMap((p) => p.suggested_ids ?? []))].filter((id) => !exclude.includes(id))
  const items = ids.map((id) => store.products.find((p) => p.id === id)).filter((p): p is StoreProduct => !!p && p.variants.some((v) => v.available !== 0))
  if (items.length === 0) return null
  return (
    <section className="space-y-2" aria-label="Você também pode gostar">
      <h2 className="text-sm font-semibold text-muted-foreground">Você também pode gostar</h2>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items.map((p) => (
          <li key={p.id}>
            <Link to={`${basePath}/produto/${p.slug}`} className="block h-full">
              <Card className="h-full overflow-hidden transition hover:shadow-md">
                {p.images[0]
                  ? <img src={imageUrl(p.images[0])} alt="" loading="lazy" className="aspect-square w-full object-contain bg-muted" />
                  : <div aria-hidden className="aspect-square w-full bg-muted" />}
                <div className="space-y-0.5 p-2">
                  <p className="text-xs font-semibold leading-tight">{p.name}</p>
                  <div className="text-xs [&_strong]:text-sm"><Price product={p} isMember={isMember} /></div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
