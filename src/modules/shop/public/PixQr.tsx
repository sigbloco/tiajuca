import { Copy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { pixCopyPaste } from '../payments/pix'

/** QR code e "copia e cola" do Pix já com o valor exato e o código do pedido. */
export function PixQr({ pixKey, beneficiary, amountCents, orderCode }: { pixKey: string; beneficiary: string; amountCents: number; orderCode: string }) {
  const code = useMemo(() => pixCopyPaste({ key: pixKey, beneficiary, amountCents, txid: orderCode }), [pixKey, beneficiary, amountCents, orderCode])
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    import('qrcode').then((m) => m.toDataURL(code, { margin: 1, width: 240 })).then((u) => { if (alive) setImg(u) }).catch(() => { if (alive) setImg(null) })
    return () => { alive = false }
  }, [code])
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success('Código Pix copiado.') } catch { toast.error('Não foi possível copiar. Selecione e copie manualmente.') }
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p className="font-semibold">Pague pelo QR code ou pelo Pix copia e cola (já com o valor)</p>
      {img && <img src={img} alt="QR code do Pix com o valor do pedido" width={240} height={240} className="mx-auto rounded-lg bg-white p-1" />}
      <p className="break-all rounded bg-muted p-2 font-mono text-xs">{code}</p>
      <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}><Copy className="h-4 w-4" /> Copiar código Pix</Button>
    </div>
  )
}
