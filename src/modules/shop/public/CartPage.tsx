import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState } from '@/components/ui/primitives'
import { formatCurrency } from '@/core/format'
import { fromCents } from '../catalog'
import { maxQuantity } from '../cart'
import { imageUrl } from '../admin/service'
import { useStore } from './StoreContext'

const money = (cents: number) => formatCurrency(fromCents(cents))

export function CartPage() {
  const { cart, index, isMember, basePath, setQty, remove } = useStore()
  if (cart.lines.length === 0) {
    return (
      <div className="space-y-3">
        <h1>Carrinho</h1>
        <EmptyState>Seu carrinho está vazio.</EmptyState>
        <Link className="font-semibold text-primary hover:underline" to={basePath}>Ver produtos</Link>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <h1>Carrinho</h1>
      <ul className="space-y-2">
        {cart.lines.map((l) => {
          const entry = index.get(l.variantId)
          const max = entry ? maxQuantity(entry) : l.quantity
          return (
            <li key={l.variantId}>
              <Card className="flex gap-3 p-3">
                {l.image ? <img src={imageUrl(l.image)} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" /> : <div aria-hidden className="h-20 w-20 shrink-0 rounded-lg bg-muted" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <Link to={`${basePath}/produto/${l.slug}`} className="font-semibold hover:underline">{l.name}</Link>
                  <p className="text-sm text-muted-foreground">{l.variantLabel}{l.kind === 'made_to_order' ? ' · sob encomenda' : ''}</p>
                  <p className="text-sm">
                    {isMember && l.unitFinalCents !== l.unitPriceCents && <s className="mr-2 text-muted-foreground">{money(l.unitPriceCents)}</s>}
                    {money(l.unitFinalCents)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label={`Diminuir ${l.name}`} onClick={() => setQty(l.variantId, l.quantity - 1)}>−</Button>
                    <span className="w-8 text-center font-bold">{l.quantity}</span>
                    <Button size="icon" variant="outline" aria-label={`Aumentar ${l.name}`} disabled={l.quantity >= max} onClick={() => setQty(l.variantId, l.quantity + 1)}>+</Button>
                    <Button size="icon" variant="ghost" aria-label={`Remover ${l.name}`} onClick={() => remove(l.variantId)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="shrink-0 font-bold">{money(l.lineTotalCents)}</p>
              </Card>
            </li>
          )
        })}
      </ul>

      <Card className="space-y-1 p-4">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(cart.subtotalCents)}</span></div>
        {cart.discountCents > 0 && <div className="flex justify-between text-primary"><span>Desconto de integrante</span><span>− {money(cart.discountCents)}</span></div>}
        <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{money(cart.totalCents)}</span></div>
      </Card>
      {cart.hasStock && cart.hasMadeToOrder && (
        <p className="rounded-lg bg-muted p-3 text-sm">Seu pedido tem itens de pronta entrega e itens sob encomenda. Os de pronta entrega ficam prontos primeiro; os sob encomenda seguem o prazo de produção, e cada grupo é retirado separadamente.</p>
      )}
      <p className="text-sm text-muted-foreground">A retirada é combinada e o pagamento é antecipado e integral. Os valores são confirmados na finalização.</p>
      <Button className="w-full" disabled title="Disponível na próxima etapa">Finalizar compra (em breve)</Button>
    </div>
  )
}
