import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton } from '@/components/ui/primitives'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { fromCents, memberPriceCents, productAvailability } from '../catalog'
import { ProductSheet } from './ProductSheet'
import { imageUrl, listProducts, type ShopProduct } from './service'
import { getSettings } from './settings'

function stockSummary(p: ShopProduct): string {
  if (p.kind === 'made_to_order') return `Sob encomenda · ${p.lead_time_days ?? '?'} dia(s)`
  const a = productAvailability(p.kind, p.shop_product_variants)
  return a.status === 'sold_out' ? 'Esgotado' : `${a.units} em estoque`
}

export function ProductsTab() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<'new' | string | null>(null)
  const q = useQuery({ queryKey: ['shop', orgId, 'products'], queryFn: () => listProducts(orgId) })
  const settings = useQuery({ queryKey: ['shop', orgId, 'settings'], queryFn: () => getSettings(orgId) })
  const defaultDiscount = settings.data?.default_member_discount_pct ?? 0
  const current = sheet && sheet !== 'new' ? q.data?.find((p) => p.id === sheet) ?? null : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Produtos</h2>
        <Button onClick={() => setSheet('new')}><Plus className="h-4 w-4" /> Novo produto</Button>
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os produtos.</EmptyState>}
      {q.data?.length === 0 && <EmptyState>Nenhum produto ainda. Crie o primeiro.</EmptyState>}
      {q.data?.map((p) => (
        <Card key={p.id} className={`flex items-center gap-3 p-3 ${p.is_active ? '' : 'opacity-60'}`}>
          {p.shop_product_images[0]
            ? <img src={imageUrl(p.shop_product_images[0].storage_path)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            : <div aria-hidden className="h-16 w-16 shrink-0 rounded-lg bg-muted" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{p.name} {!p.is_active && <Badge>Oculto</Badge>}</p>
            <p className="text-sm">
              {formatCurrency(fromCents(p.price_cents))}
              {p.member_discount_pct > 0 && <span className="text-muted-foreground"> · integrante {formatCurrency(fromCents(memberPriceCents(p.price_cents, p.member_discount_pct)))}</span>}
            </p>
            <p className="text-sm text-muted-foreground">{stockSummary(p)}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setSheet(p.id)}><Pencil className="h-4 w-4" /></Button>
        </Card>
      ))}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet === 'new' && <ProductSheet key={`new-${defaultDiscount}`} product={null} defaultDiscount={defaultDiscount} onSaved={setSheet} onClose={() => setSheet(null)} />}
        {current && <ProductSheet key={current.id} product={current} onSaved={setSheet} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
