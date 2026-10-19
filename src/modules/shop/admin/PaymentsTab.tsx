import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrganization, useOrgId } from '@/core/organization'
import { invokeShop } from '../public/api'
import { cleanHandle, fromSettings, getSettings, saveSettings, toSettings, validateSettings, type SettingsForm, type ShopSettings } from './settings'

function SettingsFormView({ initial }: { initial: ShopSettings }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [f, setF] = useState<SettingsForm>(() => fromSettings(initial, window.location.origin))
  const [errors, setErrors] = useState<string[]>([])
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const set = (patch: Partial<SettingsForm>) => setF((cur) => ({ ...cur, ...patch }))

  const save = useMutation({
    mutationFn: async () => {
      const errs = validateSettings(f)
      setErrors(errs)
      if (errs.length) return false
      await saveSettings(orgId, toSettings(f))
      return true
    },
    onSuccess: (saved) => { if (saved) { qc.invalidateQueries({ queryKey: ['shop', orgId, 'settings'] }); toast.success('Configurações salvas.') } },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const check = useMutation({
    mutationFn: () => invokeShop<{ ok: boolean; message: string }>('shop-admin', { action: 'test_infinitepay', org_slug: membership!.slug, handle: cleanHandle(f.handle) }),
    onSuccess: (r) => setTest(r),
    onError: (e) => setTest({ ok: false, message: (e as Error).message }),
  })

  const setDirector = (i: number, patch: Partial<SettingsForm['directors'][number]>) =>
    set({ directors: f.directors.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Pix (confirmação manual)</h3>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.pix} onChange={(e) => set({ pix: e.target.checked })} />
          Aceitar Pix direto
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="px-key">Chave Pix</Label>
            <Input id="px-key" autoComplete="off" value={f.pixKey} onChange={(e) => set({ pixKey: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="px-ben">Nome do favorecido</Label>
            <Input id="px-ben" autoComplete="off" value={f.pixBeneficiary} onChange={(e) => set({ pixBeneficiary: e.target.value })} /></div>
        </div>
        <p className="text-sm text-muted-foreground">O cliente paga pela chave e envia o comprovante; você confere em <strong>Pedidos</strong> e marca como pago.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">InfinitePay (cartão de crédito ou Pix)</h3>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.infinitepay} onChange={(e) => set({ infinitepay: e.target.checked })} />
          Aceitar pagamento pela InfinitePay
        </label>
        <div className="space-y-1.5"><Label htmlFor="ip-handle">InfiniteTag</Label>
          <Input id="ip-handle" placeholder="sua-tag (sem o $)" autoComplete="off" value={f.handle} onChange={(e) => { set({ handle: e.target.value }); setTest(null) }} />
          <p className="text-sm text-muted-foreground">É o nome de usuário da conta InfinitePay do bloco, o mesmo que aparece no app deles com um $ na frente.</p></div>
        <div className="space-y-2">
          <Button type="button" variant="outline" disabled={check.isPending || !cleanHandle(f.handle)} onClick={() => { setTest(null); check.mutate() }}>
            {check.isPending ? 'Testando…' : 'Testar conexão (cria um link de R$ 1, sem cobrar)'}
          </Button>
          {test && <p role="status" className={test.ok ? 'text-sm font-semibold text-primary' : 'text-sm font-semibold text-destructive'}>{test.message}</p>}
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm">Quando o cliente paga, a InfinitePay avisa a loja e o pedido é marcado como pago sozinho (a loja confere o pagamento junto à InfinitePay antes). Se algo falhar, você ainda pode marcar como pago à mão.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Desconto de integrante</h3>
        <div className="space-y-1.5"><Label htmlFor="dd">Desconto padrão para integrantes ativos (%)</Label>
          <Input id="dd" inputMode="decimal" className="max-w-32" value={f.defaultDiscount} onChange={(e) => set({ defaultDiscount: e.target.value.replace(/[^0-9.,]/g, '') })} />
          <p className="text-sm text-muted-foreground">Já vem preenchido em todo produto novo, e dá para mudar produto a produto. Não altera os produtos que já existem.</p></div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Endereço do site</h3>
        <div className="space-y-1.5"><Label htmlFor="site">Endereço da loja</Label>
          <Input id="site" inputMode="url" placeholder="https://" value={f.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })} />
          <p className="text-sm text-muted-foreground">Usado nos links dos e-mails e para a InfinitePay devolver o cliente depois de pagar. Se o domínio mudar, atualize aqui.</p></div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Contatos da loja</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ct-wa">WhatsApp da loja</Label><PhoneInput id="ct-wa" value={f.whatsapp} onChange={(v) => set({ whatsapp: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-mail">E-mail de contato</Label>
            <Input id="ct-mail" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></div>
        </div>
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 font-semibold">Direção (falar direto pelo WhatsApp)</legend>
          {f.directors.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Nome" placeholder="Nome" value={d.name} onChange={(e) => setDirector(i, { name: e.target.value })} />
              <PhoneInput value={d.phone} onChange={(v) => setDirector(i, { phone: v })} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${d.name || 'pessoa'}`} onClick={() => set({ directors: f.directors.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => set({ directors: [...f.directors, { name: '', phone: '' }] })}><Plus className="h-4 w-4" /> Adicionar pessoa</Button>
        </fieldset>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="font-bold">Remetente dos e-mails</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ml-name">Nome</Label>
            <Input id="ml-name" value={f.mailFromName} onChange={(e) => set({ mailFromName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ml-mail">E-mail</Label>
            <Input id="ml-mail" type="email" value={f.mailFromEmail} onChange={(e) => set({ mailFromEmail: e.target.value })} /></div>
        </div>
        <p className="text-sm text-muted-foreground">Quem aparece como remetente nos avisos aos clientes. Com o Gmail, use o mesmo e-mail da conta que envia.</p>
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
      <h2 className="text-lg font-bold">Pagamentos e contatos</h2>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <p className="text-destructive">Não foi possível carregar as configurações.</p>}
      {q.data && <SettingsFormView key={JSON.stringify(q.data)} initial={q.data} />}
    </div>
  )
}
