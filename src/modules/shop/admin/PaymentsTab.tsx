import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, Input, Label, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrganization, useOrgId } from '@/core/organization'
import { invokeShop } from '../public/api'
import { cleanHandle, getSettings, saveSettings, type ShopSettings } from './service'
import { toSettings, validatePayments, type PaymentsForm } from './settings'

function PaymentsForm_({ initial }: { initial: ShopSettings }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [f, setF] = useState<PaymentsForm>({
    pix: initial.payment_methods.includes('pix'), infinitepay: initial.payment_methods.includes('infinitepay'),
    handle: initial.infinitepay_handle ?? '', siteUrl: initial.public_site_url ?? window.location.origin,
  })
  const [errors, setErrors] = useState<string[]>([])
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const errs = validatePayments(f)
      setErrors(errs)
      if (errs.length) return false
      await saveSettings(orgId, toSettings(f))
      return true
    },
    onSuccess: (saved) => { if (saved) { qc.invalidateQueries({ queryKey: ['shop', orgId, 'settings'] }); toast.success('Formas de pagamento salvas.') } },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const check = useMutation({
    mutationFn: () => invokeShop<{ ok: boolean; message: string }>('shop-admin', { action: 'test_infinitepay', org_slug: membership!.slug, handle: cleanHandle(f.handle) }),
    onSuccess: (r) => setTest(r),
    onError: (e) => setTest({ ok: false, message: (e as Error).message }),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Pix (confirmação manual)</h3>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.pix} onChange={(e) => setF({ ...f, pix: e.target.checked })} />
          Aceitar Pix direto
        </label>
        <p className="text-sm text-muted-foreground">O cliente paga pela chave Pix do bloco e envia o comprovante; você confere e marca o pedido como pago. A chave Pix e os contatos ficam em <code>shop.config.ts</code>.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">InfinitePay (cartão de crédito ou Pix)</h3>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.infinitepay} onChange={(e) => setF({ ...f, infinitepay: e.target.checked })} />
          Aceitar pagamento pela InfinitePay
        </label>
        <div className="space-y-1.5"><Label htmlFor="ip-handle">InfiniteTag</Label>
          <Input id="ip-handle" placeholder="sua-tag (sem o $)" autoComplete="off" value={f.handle} onChange={(e) => { setF({ ...f, handle: e.target.value }); setTest(null) }} />
          <p className="text-sm text-muted-foreground">É o nome de usuário da conta InfinitePay do bloco, o mesmo que aparece no app deles com um $ na frente.</p></div>
        <div className="space-y-1.5"><Label htmlFor="ip-site">Endereço do site</Label>
          <Input id="ip-site" inputMode="url" placeholder="https://" value={f.siteUrl} onChange={(e) => setF({ ...f, siteUrl: e.target.value })} />
          <p className="text-sm text-muted-foreground">Para onde a InfinitePay devolve o cliente depois de pagar. Se o domínio mudar, atualize aqui.</p></div>
        <div className="space-y-2">
          <Button type="button" variant="outline" disabled={check.isPending || !cleanHandle(f.handle)} onClick={() => { setTest(null); check.mutate() }}>
            {check.isPending ? 'Testando…' : 'Testar conexão (cria um link de R$ 1, sem cobrar)'}
          </Button>
          {test && <p role="status" className={test.ok ? 'text-sm font-semibold text-primary' : 'text-sm font-semibold text-destructive'}>{test.message}</p>}
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm">Quando o cliente paga, a InfinitePay avisa a loja e o pedido é marcado como pago sozinho (a loja confere o pagamento junto à InfinitePay antes). Se algo falhar, você ainda pode marcar como pago à mão.</p>
      </Card>

      {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
    </form>
  )
}

export function PaymentsTab() {
  const orgId = useOrgId()
  const q = useQuery({ queryKey: ['shop', orgId, 'settings'], queryFn: () => getSettings(orgId) })
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Formas de pagamento</h2>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <p className="text-destructive">Não foi possível carregar as configurações.</p>}
      {q.data && <PaymentsForm_ key={JSON.stringify(q.data)} initial={q.data} />}
    </div>
  )
}
