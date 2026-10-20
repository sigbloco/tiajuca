import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Palette } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card, cn } from '@/components/ui/primitives'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { OrdersTab } from './OrdersTab'
import { PaymentsTab } from './PaymentsTab'
import { PickupPointsTab } from './PickupPointsTab'
import { ProductsTab } from './ProductsTab'
import { getSettings, missingSetup } from './settings'

const TABS = [
  { key: 'orders', label: 'Pedidos' },
  { key: 'products', label: 'Produtos' },
  { key: 'pickup', label: 'Pontos de retirada' },
  { key: 'payments', label: 'Configurações' },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Painel da loja (exige `shop.manage`, filtrado no menu; o RLS é a barreira real). */
export function ShopAdminPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const canTheme = usePermission('org.manage')
  const [tab, setTab] = useState<TabKey>('orders')
  const settings = useQuery({ queryKey: ['shop', orgId, 'settings'], queryFn: () => getSettings(orgId) })
  const pending = settings.data ? missingSetup(settings.data) : []
  return (
    <div className="space-y-4">
      <h1>Loja</h1>
      {pending.length > 0 && (
        <Card className="border-secondary p-4">
          <p className="font-semibold">Falta configurar antes de vender (aba Configurações):</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{pending.map((p) => <li key={p}>{p}</li>)}</ul>
        </Card>
      )}
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'default' : 'outline'} className={cn('min-h-11')} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
        {canTheme && <Button asChild variant="outline" className="min-h-11"><Link to={`/${membership?.slug}/interface?area=shop`}><Palette className="h-4 w-4" /> Interface</Link></Button>}
      </div>
      {tab === 'orders' ? <OrdersTab /> : tab === 'products' ? <ProductsTab /> : tab === 'pickup' ? <PickupPointsTab /> : <PaymentsTab />}
    </div>
  )
}
