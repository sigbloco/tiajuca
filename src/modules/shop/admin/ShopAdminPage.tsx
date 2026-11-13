import { FitWord } from '@/components/shared/FitText'
import { useQuery } from '@tanstack/react-query'
import { Palette, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { Button, Card } from '@/components/ui/primitives'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { OrdersTab } from './OrdersTab'
import { PaymentsTab } from './PaymentsTab'
import { PickupPointsTab } from './PickupPointsTab'
import { ProductsTab } from './ProductsTab'
import { StockTab } from './StockTab'
import { getSettings, missingSetup } from './settings'

const TABS = [
  { key: 'orders', label: 'Pedidos' },
  { key: 'products', label: 'Produtos' },
  { key: 'stock', label: 'Estoque' },
  { key: 'pickup', label: 'Pontos de retirada' },
] as const
type TabKey = (typeof TABS)[number]['key'] | 'payments'
const TAB_LABEL: Record<TabKey, string> = { orders: 'Pedidos', products: 'Produtos', stock: 'Estoque', pickup: 'Pontos de retirada', payments: 'Configurações' }

/** Painel da loja (exige `shop.manage`, filtrado no menu; o RLS é a barreira real). */
export function ShopAdminPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const canTheme = usePermission('org.manage')
  const [tab, setTab] = useRememberedState<TabKey>('loja-aba', 'orders', ['orders', 'products', 'stock', 'pickup', 'payments'])
  useRegisterCrumb(TAB_LABEL[tab], () => setTab('orders'), true, 0)
  const settings = useQuery({ queryKey: ['shop', orgId, 'settings'], queryFn: () => getSettings(orgId) })
  const pending = settings.data ? missingSetup(settings.data) : []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1>Loja</h1>
        <div className="flex gap-2">
          <Button role="tab" aria-selected={tab === 'payments'} aria-label="Configurações" title="Configurações" variant={tab === 'payments' ? 'default' : 'outline'}
            size="icon" className="min-h-11 min-w-11" onClick={() => setTab('payments')}><Settings className="h-5 w-5" /></Button>
          {canTheme && (
            <Button asChild variant="outline" size="icon" className="min-h-11 min-w-11">
              <Link to={`/${membership?.slug}/interface?area=shop`} aria-label="Interface" title="Interface"><Palette className="h-5 w-5" /></Link>
            </Button>
          )}
        </div>
      </div>
      {pending.length > 0 && (
        <Card className="border-secondary p-4">
          <p className="font-semibold">Falta configurar antes de vender (botão de configurações, ao lado do título):</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{pending.map((p) => <li key={p}>{p}</li>)}</ul>
        </Card>
      )}
      <ButtonRow role="tablist" aria-label="Seções da loja">
        {TABS.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'default' : 'outline'} className="min-h-11" onClick={() => setTab(t.key)}>
            <FitWord>{t.label}</FitWord>
          </Button>
        ))}
      </ButtonRow>
      {tab === 'orders' ? <OrdersTab /> : tab === 'products' ? <ProductsTab /> : tab === 'stock' ? <StockTab /> : tab === 'pickup' ? <PickupPointsTab /> : <PaymentsTab />}
    </div>
  )
}
