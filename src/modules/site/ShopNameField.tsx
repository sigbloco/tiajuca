import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

/** Nome público da loja (botão do site, menu e vitrine). Fica guardado junto das configurações do site. */
export function ShopNameField() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['site-shop-label', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('shop_label').eq('organization_id', orgId).maybeSingle()
      if (error) throw error
      return (data?.shop_label as string | undefined) ?? 'Loja'
    },
  })
  const [v, setV] = useState('Loja')
  useEffect(() => { if (q.data) setV(q.data) }, [q.data])
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('site_settings').upsert({ organization_id: orgId, shop_label: v.trim() || 'Loja' }, { onConflict: 'organization_id' })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Nome da loja salvo.'); for (const k of ['site-shop-label', 'site-settings', 'public-site']) qc.invalidateQueries({ queryKey: [k] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-1.5">
      <Label htmlFor="shop-name">Nome da loja</Label>
      <div className="flex gap-2">
        <Input id="shop-name" maxLength={40} value={v} onChange={(e) => setV(e.target.value)} />
        <Button type="button" disabled={save.isPending || v.trim() === (q.data ?? 'Loja')} onClick={() => save.mutate()}>Salvar nome</Button>
      </div>
      <p className="text-sm text-muted-foreground">Aparece no botão do site e no topo da vitrine.</p>
    </div>
  )
}
