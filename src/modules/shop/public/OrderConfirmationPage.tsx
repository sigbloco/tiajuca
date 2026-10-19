import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { formatCurrency, formatDateTime } from '@/core/format'
import { fromCents } from '../catalog'
import { directorLinks, pixInstructions } from '../payments/pix'
import { invokeShop, loadSnapshot } from './api'
import { useStore } from './StoreContext'

const money = (cents: number) => formatCurrency(fromCents(cents))
const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: 'Aguardando pagamento', payment_review: 'Pagamento em conferência', paid: 'Pago', cancelled: 'Cancelado',
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copiado.`) } catch { toast.error('Não foi possível copiar. Selecione e copie manualmente.') }
}

/** Confirmação logo depois da compra: código do pedido e instruções do método escolhido. */
export function OrderConfirmationPage() {
  const { code = '' } = useParams()
  const { basePath, store } = useStore()
  const snap = loadSnapshot(code)
  const [status, setStatus] = useState(snap?.order.status ?? '')

  // Enquanto o pagamento não for confirmado, confere o status de tempos em tempos (até 30 min nesta tela).
  const [startedAt] = useState(() => Date.now())
  const waiting = !!snap && (status === 'awaiting_payment' || status === 'payment_review') && Date.now() - startedAt < 30 * 60_000
  useQuery({
    queryKey: ['shop', 'order-status', code],
    enabled: waiting,
    refetchInterval: waiting ? 20_000 : false,
    queryFn: async () => {
      const r = await invokeShop<{ status: string }>('shop-order-public', { action: 'status', code, phone: snap!.phone })
      setStatus(r.status)
      return r.status
    },
  })

  const report = useMutation({
    mutationFn: () => invokeShop<{ status: string }>('shop-order-public', { action: 'report_payment', code, phone: snap!.phone }),
    onSuccess: (r) => { setStatus(r.status); toast.success('Avisamos a loja. Vamos conferir o seu pagamento.') },
    onError: (e) => toast.error((e as Error).message),
  })

  if (!snap) {
    return (
      <Card className="space-y-2 p-6">
        <h1>Pedido {code}</h1>
        <p>Não encontramos os dados deste pedido neste aparelho. Guarde o código do pedido e o telefone usado na compra.</p>
        <Link className="font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link>
      </Card>
    )
  }
  const { order, customerName } = snap
  const directors = directorLinks(store.contact, order.code)
  const pix = order.payment_method === 'pix' && store.pix
    ? pixInstructions({ pix: store.pix, contact: store.contact, orderCode: order.code, totalCents: order.total_cents, customerName })
    : null

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="space-y-2 p-5 text-center">
        <p className="text-sm text-muted-foreground">Pedido recebido! Guarde o seu código:</p>
        <p className="font-display text-4xl font-extrabold tracking-widest" aria-label={`Código do pedido ${order.code.split('').join(' ')}`}>{order.code}</p>
        <Button variant="outline" size="sm" onClick={() => copy(order.code, 'Código')}><Copy className="h-4 w-4" /> Copiar código</Button>
        <p><Badge>{STATUS_LABEL[status] ?? status}</Badge></p>
        <p className="text-sm text-muted-foreground">Para consultar o pedido você vai precisar do código e do telefone usado na compra.</p>
      </Card>

      {status === 'paid' && (
        <Card className="space-y-1 border-primary p-5"><h2 className="text-lg font-bold">Pagamento confirmado!</h2>
          <p>Obrigado! Avisaremos quando o seu pedido estiver pronto para retirada.</p></Card>
      )}
      {status === 'cancelled' && (
        <Card className="space-y-1 p-5"><h2 className="text-lg font-bold">Pedido cancelado</h2>
          <p>Este pedido foi cancelado. Se você já pagou, fale com a Direção abaixo.</p></Card>
      )}
      {order.payment_method === 'infinitepay' && status === 'awaiting_payment' && (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Pague com cartão de crédito ou Pix</h2>
          <p className="text-sm">O pagamento é feito em uma página segura da InfinitePay. Quando for confirmado, esta tela e o seu pedido são atualizados automaticamente.</p>
          {snap.paymentUrl
            ? <a className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-bold text-primary-foreground hover:opacity-90" href={snap.paymentUrl}>Ir para o pagamento · {money(order.total_cents)}</a>
            : <p className="text-sm text-muted-foreground">Se a página de pagamento não abriu, fale com a Direção abaixo.</p>}
          {order.expires_at && <p className="text-sm text-muted-foreground">Seus itens ficam reservados até {formatDateTime(order.expires_at)}.</p>}
        </Card>
      )}
      {pix && status === 'awaiting_payment' && (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-bold">Pague com Pix</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Valor exato</dt><dd className="text-xl font-extrabold">{pix.amountText}</dd></div>
            <div><dt className="text-muted-foreground">Chave Pix ({pix.beneficiary})</dt>
              <dd className="flex flex-wrap items-center gap-2 break-all font-semibold">{pix.key}
                <Button size="sm" variant="outline" onClick={() => copy(pix.key, 'Chave Pix')}><Copy className="h-4 w-4" /> Copiar</Button></dd></div>
            <div><dt className="text-muted-foreground">Informe no Pix como referência/mensagem</dt><dd className="font-bold tracking-widest">{pix.reference}</dd></div>
          </dl>
          <p className="rounded-lg bg-muted p-3 text-sm">Depois de pagar, envie o <strong>comprovante</strong> por WhatsApp ou e-mail. O pedido só é confirmado quando a loja conferir o pagamento.</p>
          <div className="flex flex-wrap gap-2">
            {pix.whatsappUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={pix.whatsappUrl} target="_blank" rel="noreferrer noopener">Enviar pelo WhatsApp</a>}
            {pix.mailtoUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={pix.mailtoUrl}>Enviar por e-mail</a>}
          </div>
          <Button className="w-full" disabled={report.isPending} onClick={() => report.mutate()}>{report.isPending ? 'Enviando…' : 'Já fiz o pagamento'}</Button>
          {order.expires_at && <p className="text-sm text-muted-foreground">Seus itens ficam reservados até {formatDateTime(order.expires_at)}. Se o pagamento não for informado até lá, o pedido é cancelado.</p>}
        </Card>
      )}
      {pix && status === 'payment_review' && (
        <Card className="space-y-1 p-5"><h2 className="text-lg font-bold">Pagamento em conferência</h2>
          <p>Recebemos o seu aviso. Assim que a loja conferir o comprovante, o pedido é marcado como pago e você recebe um e-mail.</p>
          <p className="text-sm text-muted-foreground">Ainda não enviou o comprovante? Mande pelo {pix.whatsappUrl ? <a className="font-semibold text-primary hover:underline" href={pix.whatsappUrl} target="_blank" rel="noreferrer noopener">WhatsApp</a> : 'contato da loja'}.</p></Card>
      )}

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-bold">Retirada</h2>
        <p className="font-semibold">{order.pickup.name}</p>
        <p className="text-sm">{order.pickup.address}</p>
        {order.pickup.opening_hours && <p className="text-sm text-muted-foreground">{order.pickup.opening_hours}</p>}
        <p className="text-sm">A retirada é <strong>combinada</strong>: avisaremos quando o pedido estiver pronto.</p>
        {order.kinds.length > 1 && <p className="text-sm text-muted-foreground">Os itens de pronta entrega e os sob encomenda ficam prontos em momentos diferentes.</p>}
      </Card>

      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-bold">Itens</h2>
        <ul className="space-y-1 text-sm">
          {order.items.map((i) => <li key={`${i.name}-${i.variant}`} className="flex justify-between gap-2"><span>{i.quantity}× {i.name} ({i.variant}){i.kind === 'made_to_order' ? ' · sob encomenda' : ''}</span><span>{money(i.unit_final_cents * i.quantity)}</span></li>)}
        </ul>
        {order.discount_cents > 0 && <div className="flex justify-between text-sm text-primary"><span>Desconto de integrante</span><span>− {money(order.discount_cents)}</span></div>}
        <div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{money(order.total_cents)}</span></div>
      </Card>
      {directors.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="text-lg font-bold">Precisa de ajuda?</h2>
          <p className="text-sm text-muted-foreground">Fale direto com alguém da Direção pelo WhatsApp:</p>
          <div className="flex flex-wrap gap-2">
            {directors.map((d) => <a key={d.name} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold hover:bg-muted" href={d.url} target="_blank" rel="noreferrer noopener">{d.name}</a>)}
          </div>
        </Card>
      )}
      <Link className="block text-center font-semibold text-primary hover:underline" to={`${basePath}/consultar`} state={{ code: order.code, phone: snap.phone }}>Acompanhar meu pedido</Link>
      <Link className="block text-center font-semibold text-primary hover:underline" to={basePath}>Voltar à loja</Link>
    </div>
  )
}
