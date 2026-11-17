import { Copy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { pixCopyPaste } from '../payments/pix'

/** QR code e "copia e cola" do Pix já com o valor exato e o código do pedido. */
export function PixQr({ pixKey, beneficiary, amountCents, orderCode, size = 132, sideBySide = false }: { pixKey: string; beneficiary: string; amountCents: number; orderCode: string; size?: number; sideBySide?: boolean }) {
  const code = useMemo(() => pixCopyPaste({ key: pixKey, beneficiary, amountCents, txid: orderCode }), [pixKey, beneficiary, amountCents, orderCode])
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
    return (
      <div className="grid grid-cols-2 items-center gap-3">
        <div>{img && <img src={img} alt="QR code do Pix com o valor do pedido" className="w-full max-w-[9rem] rounded-lg bg-white p-1" />}</div>
        <div className="min-w-0 space-y-2">
          <p className="line-clamp-4 break-all rounded bg-muted p-2 font-mono text-[10px] leading-tight">{code}</p>
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
