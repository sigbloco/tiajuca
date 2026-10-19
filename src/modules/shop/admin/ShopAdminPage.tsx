import { useState } from 'react'
import { Button, Card, cn } from '@/components/ui/primitives'
import { findPendingFields } from '../config/schema'
import { getShopConfig } from '../config/shop.config'
import { PaymentsTab } from './PaymentsTab'
import { PickupPointsTab } from './PickupPointsTab'
import { ProductsTab } from './ProductsTab'

const TABS = [
  { key: 'products', label: 'Produtos' },
  { key: 'pickup', label: 'Pontos de retirada' },
  { key: 'payments', label: 'Pagamentos' },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Painel da loja (exige `shop.manage`, filtrado no menu; o RLS é a barreira real). Pedidos entram na etapa 6. */
export function ShopAdminPage() {
  const [tab, setTab] = useState<TabKey>('products')
  const pending = findPendingFields(getShopConfig())
  return (
    <div className="space-y-4">
      <h1>Loja</h1>
      {pending.length > 0 && (
        <Card className="border-secondary p-4">
          <p className="font-semibold">Falta preencher em <code>shop.config.ts</code> antes de vender:</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{pending.map((p) => <li key={p}><code>{p}</code></li>)}</ul>
        </Card>
      )}
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'default' : 'outline'} className={cn('min-h-11')} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === 'products' ? <ProductsTab /> : tab === 'pickup' ? <PickupPointsTab /> : <PaymentsTab />}
    </div>
  )
}
