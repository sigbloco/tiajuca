import { Card } from '@/components/ui/primitives'
import { getShopConfig } from '../config/shop.config'

/** Vitrine pública da loja (sem login). O catálogo entra na etapa 3. */
export function ShopHomePage() {
  const { orgSlug } = getShopConfig()
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card className="p-6">
        <h1 className="font-display text-2xl font-extrabold">Loja</h1>
        <p className="mt-2 text-muted-foreground">Em breve. ({orgSlug})</p>
      </Card>
    </main>
  )
}
