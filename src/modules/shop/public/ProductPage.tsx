import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, Label, cn } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { MAX_QTY_PER_LINE, maxQuantity } from '../cart'
import { imageUrl } from '../admin/service'
import { Price } from './Price'
import { useStore } from './StoreContext'

export function ProductPage() {
  const { slug = '' } = useParams()
  const { store, isMember, basePath, add, cart, setLoginOpen } = useStore()
  const { session } = useAuth()
  const navigate = useNavigate()
  const product = store.products.find((p) => p.slug === slug)
  const [picked, setPicked] = useState<string>('')
  const [qty, setQty] = useState(1)
  const [photo, setPhoto] = useState(0)

  if (!product) {
    return <Card className="p-6">Produto não encontrado. <Link className="font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link></Card>
  }
  // Com uma única variação disponível ela já vem escolhida.
  const variantId = picked || (product.variants.length === 1 && product.variants[0].available !== 0 ? product.variants[0].id : '')
  const variant = product.variants.find((v) => v.id === variantId)
  const inCart = cart.lines.find((l) => l.variantId === variantId)?.quantity ?? 0
  const room = variant ? maxQuantity({ product, variant }) - inCart : 0
  const soldOut = product.variants.every((v) => v.available === 0)

  return (
    <div className="space-y-3">
      <Link className="text-sm font-semibold text-primary hover:underline" to={basePath}>← Voltar à loja</Link>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          {product.images.length > 0
            ? <img src={imageUrl(product.images[photo] ?? product.images[0])} alt={product.name} className="aspect-square w-full rounded-xl object-cover" />
            : <div aria-hidden className="aspect-square w-full rounded-xl bg-muted" />}
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((img, i) => (
                <button key={img} type="button" aria-label={`Foto ${i + 1}`} aria-current={i === photo} onClick={() => setPhoto(i)}
                  className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2', i === photo ? 'border-primary' : 'border-transparent')}>
                  <img src={imageUrl(img)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <h1>{product.name}</h1>
          <Price product={product} isMember={isMember} />
          {!isMember && !session && product.member_discount_pct > 0 && (
            <p className="text-sm text-muted-foreground">Integrante do bloco? <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setLoginOpen(true)}>Entre</button> para ver o seu preço.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {product.kind === 'made_to_order'
              ? <Badge>Sob encomenda · produção em {product.lead_time_days} dias</Badge>
              : <Badge>Pronta entrega</Badge>}
          </div>
          {product.description && <p className="whitespace-pre-line">{product.description}</p>}

          {soldOut ? <Badge>Esgotado</Badge> : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label id="var-l">Tamanho / variação</Label>
                <div role="radiogroup" aria-labelledby="var-l" className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const out = v.available === 0
                    return (
                      <button key={v.id} type="button" role="radio" aria-checked={variantId === v.id} disabled={out}
                        onClick={() => { setPicked(v.id); setQty(1) }}
                        className={cn('min-h-11 min-w-11 rounded-lg border px-3 font-semibold disabled:cursor-not-allowed disabled:line-through disabled:opacity-50',
                          variantId === v.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
                        {v.label}
                      </button>
                    )
                  })}
                </div>
                {variant && variant.available !== null && variant.available <= 5 && <p className="text-sm text-muted-foreground">Restam {variant.available}.</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label="Diminuir" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</Button>
                <span className="w-8 text-center font-bold" aria-live="polite">{qty}</span>
                <Button type="button" variant="outline" size="icon" aria-label="Aumentar" disabled={!variant || qty >= Math.min(room, MAX_QTY_PER_LINE)} onClick={() => setQty(qty + 1)}>+</Button>
              </div>
              <Button className="w-full" disabled={!variant || room <= 0} onClick={() => {
                add(variantId, qty)
                toast.success('Adicionado ao carrinho.', { action: { label: 'Ver carrinho', onClick: () => navigate(`${basePath}/carrinho`) } })
              }}>
                {!variant ? 'Escolha uma opção' : room <= 0 ? 'Quantidade máxima no carrinho' : 'Adicionar ao carrinho'}
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Retirada combinada em um dos pontos de retirada. Pagamento antecipado.</p>
        </div>
      </div>
    </div>
  )
}
