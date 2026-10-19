import { Card } from '@/components/ui/primitives'
import { findPendingFields } from '../config/schema'
import { getShopConfig } from '../config/shop.config'

/** Painel da loja (exige `shop.manage`, filtrado no menu; o RLS é a barreira real). Produtos e pedidos entram nas próximas etapas. */
export function ShopAdminPage() {
  const pending = findPendingFields(getShopConfig())
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Loja</h1>
      {pending.length > 0 && (
        <Card className="border-secondary p-4">
          <p className="font-semibold">Falta preencher em <code>shop.config.ts</code> antes de vender:</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{pending.map((p) => <li key={p}><code>{p}</code></li>)}</ul>
        </Card>
      )}
    </div>
  )
}
