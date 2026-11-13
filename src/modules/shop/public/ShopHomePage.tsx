import { ButtonRow } from '@/components/shared/ButtonRow'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, cn } from '@/components/ui/primitives'
import { productAvailability, type ProductKind } from '../catalog'
import { imageUrl } from '../admin/service'
import { Price } from './Price'
import { useStore } from './StoreContext'

const FILTERS: { key: ProductKind; label: string }[] = [
  { key: 'stock', label: 'Pronta entrega' },
  { key: 'made_to_order', label: 'Sob encomenda' },
]

/** Vitrine pública: lista de produtos com filtro por tipo (estoque / encomenda). */
export function ShopHomePage() {
  const { store, isMember, basePath } = useStore()
  // Pronta entrega e Sob encomenda se combinam; os dois marcados mostram tudo e nenhum marcado não mostra nada. O filtro não afeta os destaques.
  const [kinds, setKinds] = useState<ProductKind[]>(['stock', 'made_to_order'])
  const toggleKind = (k: ProductKind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  const featured = store.products.filter((p) => p.is_featured)
  const others = store.products.filter((p) => !p.is_featured && kinds.includes(p.kind))

  return (
    <div className="space-y-4">
      {store.intro_text && <p className="whitespace-pre-line rounded-lg border border-secondary p-3">{store.intro_text}</p>}
      {featured.length > 0 && (
        <section aria-labelledby="shop-featured" className="space-y-2">
          <h2 id="shop-featured" className="text-xl font-bold">{store.featured_title || 'Destaques'}</h2>
          {renderGrid(featured)}
        </section>
      )}
      <ButtonRow role="group" aria-label="Filtrar produtos">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={kinds.includes(f.key) ? 'default' : 'outline'} aria-pressed={kinds.includes(f.key)} onClick={() => toggleKind(f.key)}>{f.label}</Button>
        ))}
      </ButtonRow>
      {store.products.length > 0 && kinds.length === 0 && <p className="-mt-2 text-sm text-muted-foreground">Selecione um filtro.</p>}
      <p className="rounded-lg bg-muted p-3 text-sm">Retirada combinada, sem entrega. O pagamento é antecipado.</p>
      {store.products.length === 0 && <EmptyState>A loja ainda não tem produtos.</EmptyState>}
      {kinds.length > 0 && others.length === 0 && store.products.some((p) => !p.is_featured) && <EmptyState>Nenhum produto neste filtro.</EmptyState>}
      {others.length > 0 && renderGrid(others)}
    </div>
  )

  function renderGrid(products: typeof store.products) {
    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => {
          const a = productAvailability(p.kind, p.variants.map((v) => ({ stock: v.available, reserved: 0, is_active: true })))
          const soldOut = a.status === 'sold_out'
          return (
            <li key={p.id}>
              <Link to={`${basePath}/produto/${p.slug}`} className="block h-full">
                <Card className={cn('h-full overflow-hidden transition hover:shadow-md', soldOut && 'opacity-70 grayscale')}>
                  {p.images[0]
                    ? <img src={imageUrl(p.images[0])} alt={p.name} loading="lazy" className="aspect-square w-full object-contain bg-muted" />
                    : <div aria-hidden className="aspect-square w-full bg-muted" />}
                  <div className="space-y-1 p-3">
                    <p className="font-semibold leading-tight">{p.name}</p>
                    <Price product={p} isMember={isMember} />
                    <div>
                      {soldOut ? <Badge>Esgotado</Badge> : p.kind === 'made_to_order' ? <Badge>Sob encomenda · {p.lead_time_days}</Badge> : <Badge>Pronta entrega</Badge>}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }
}
