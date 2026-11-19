import { KitChip } from '@/modules/shop/KitChip'
import { Flame } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, cn } from '@/components/ui/primitives'
import { remainingView } from '../catalog'
import { imageUrl } from '../admin/service'
import type { StoreProduct } from '../cart'
import { Price } from './Price'
import { useStore } from './StoreContext'

/**
 * Meta mínima: só aparece quando a direção preencheu o mínimo do produto E ligou o contador.
 * Se definiu "só quando faltarem até N", some até chegar perto. Faltando pouco, ganha destaque.
 */
export function MinUnitsBar({ product }: { product: StoreProduct }) {
  const v = remainingView(product)
  if (!v || !v.visible) return null
  const { min, done, remaining, reached, urgent } = v
  return (
    <div className={cn('space-y-1.5 rounded-lg p-3 text-sm', urgent ? 'border-2 border-primary bg-primary/10' : 'bg-muted')}>
      {urgent && (
        <p className="flex items-center gap-2 text-base font-extrabold text-primary">
          <Flame className="h-5 w-5 shrink-0" aria-hidden /> Faltam só {remaining} {remaining === 1 ? 'unidade' : 'unidades'} para a produção começar!
        </p>
      )}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(done, min)} aria-label="Unidades pagas até o mínimo para produzir"
        className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((done / min) * 100))}%` }} />
      </div>
      <p><strong>{done} de {min}</strong> unidades pagas. {reached
        ? 'Mínimo atingido, a produção já pode começar.'
        : urgent ? 'O prazo de produção conta a partir daí.' : `Faltam ${remaining} para a produção começar, e o prazo conta a partir daí.`}</p>
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
                  <p className="text-xs font-semibold leading-tight">{p.is_kit && <KitChip />}{p.name}</p>
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

/** Sugestões aleatórias no carrinho (sorteadas ao abrir a página). Produto de variação única entra com um clique; os demais pedem para escolher. */
export function RandomSuggestions({ exclude }: { exclude: string[] }) {
  const { store, isMember, basePath, add } = useStore()
  const [order] = useState(() => Math.random())
  const pool = store.products.filter((p) => !exclude.includes(p.id) && p.variants.some((v) => v.available !== 0))
  // Embaralha de forma estável durante a visita à página (semente sorteada uma vez).
  const items = pool
    .map((p, i) => ({ p, k: Math.sin((i + 1) * 9301 + order * 49297) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 4)
    .map((x) => x.p)
  if (items.length === 0) return null
  return (
    <section className="space-y-2" aria-label="Que tal levar também">
      <h2 className="text-sm font-semibold text-muted-foreground">Que tal levar também?</h2>
      <ul className="grid max-w-md grid-cols-4 gap-1.5">
        {items.map((p) => {
          const options = p.variants.filter((v) => v.available !== 0)
          return (
            <li key={p.id}>
              <Card className="flex h-full flex-col overflow-hidden">
                <Link to={`${basePath}/produto/${p.slug}`} className="block">
                  {p.images[0]
                    ? <img src={imageUrl(p.images[0])} alt="" loading="lazy" className="aspect-square w-full object-contain bg-muted" />
                    : <div aria-hidden className="aspect-square w-full bg-muted" />}
                </Link>
                <div className="flex flex-1 flex-col gap-1 p-1.5">
                  <p className="line-clamp-2 text-[11px] font-semibold leading-tight">{p.is_kit && <KitChip />}{p.name}</p>
                  <div className="text-[11px] [&_strong]:text-xs"><Price product={p} isMember={isMember} /></div>
                  {options.length === 1 && p.variants.length === 1
                    ? <Button size="sm" className="mt-auto h-7 w-full px-1 text-xs" onClick={() => { add(options[0].id, 1); toast.success(`${p.name} adicionado.`) }}>Adicionar</Button>
                    : <Link to={`${basePath}/produto/${p.slug}`} className="mt-auto inline-flex h-7 w-full items-center justify-center rounded-lg border border-border px-1 text-xs font-semibold hover:bg-muted">Opções</Link>}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
