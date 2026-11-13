import { Input, Label } from '@/components/ui/primitives'
import { supabase } from '@/core/supabase'

/** Nome público da loja (botão do site, menu e vitrine). Fica guardado junto das configurações do site. */
export async function getShopLabel(orgId: string): Promise<string> {
  const { data, error } = await supabase.from('site_settings').select('shop_label').eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return (data?.shop_label as string | undefined) ?? 'Loja'
}

export async function saveShopLabel(orgId: string, value: string) {
  const { error } = await supabase.from('site_settings').upsert({ organization_id: orgId, shop_label: value.trim() || 'Loja' }, { onConflict: 'organization_id' })
  if (error) throw error
}

/** Campo do nome da loja: quem salva é o botão Salvar da página de configurações. */
export function ShopNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="shop-name">Nome da loja</Label>
      <Input id="shop-name" maxLength={40} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-sm text-muted-foreground">Aparece no botão do site e no topo da vitrine.</p>
    </div>
  )
}
