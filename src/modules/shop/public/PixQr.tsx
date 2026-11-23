import { Copy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { pixCopyPaste } from '../payments/pix'

/** QR code e "copia e cola" do Pix já com o valor exato e o código do pedido. */
export function PixQr({ pixKey, beneficiary, city, amountCents, orderCode, size = 132, sideBySide = false }: { pixKey: string; beneficiary: string; city?: string | null; amountCents: number; orderCode: string; size?: number; sideBySide?: boolean }) {
  const code = useMemo(() => pixCopyPaste({ key: pixKey, beneficiary, city: city ?? undefined, amountCents, txid: orderCode }), [pixKey, beneficiary, city, amountCents, orderCode])
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    import('qrcode').then((m) => m.toDataURL(code, { margin: 1, width: size * 2 })).then((u) => { if (alive) setImg(u) }).catch(() => { if (alive) setImg(null) })
    return () => { alive = false }
  }, [code, size])
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success('Código Pix copiado.') } catch { toast.error('Não foi possível copiar. Selecione e copie manualmente.') }
  }
  if (sideBySide) {
    // QR à esquerda; à direita o código ocupa toda a altura do QR e o botão fica alinhado com a base dele.
    return (
      <div className="grid grid-cols-[auto_1fr] items-stretch gap-3">
        {img ? <img src={img} alt="QR code do Pix com o valor do pedido" className="h-36 w-36 rounded-lg bg-white p-1 sm:h-40 sm:w-40" /> : <div className="h-36 w-36 sm:h-40 sm:w-40" />}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="min-h-0 flex-1 overflow-hidden break-all rounded bg-muted p-2 font-mono text-[10px] leading-snug sm:text-sm">{code}</p>
          <Button type="button" variant="outline" size="sm" className="w-full gap-1 px-2 text-xs" onClick={() => void copy()}><Copy className="h-3.5 w-3.5 shrink-0" /> Copiar código Pix</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {img && <img src={img} alt="QR code do Pix com o valor do pedido" width={size} height={size} className="mx-auto rounded-lg bg-white p-1" />}
      <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}><Copy className="h-4 w-4" /> Copiar código Pix</Button>
    </div>
  )
}
