// Pix "copia e cola" (BR Code estático) para o e-mail. É a mesma regra de src/modules/shop/payments/pix.ts (a função de borda
// não importa de src/); a igualdade das duas é conferida em templates.test.ts.

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** CRC16/CCITT-FALSE exigido pelo BR Code do Pix. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const clean = (s: string, max: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max)

export function pixCopyPaste(a: { key: string; beneficiary: string; amountCents: number; txid: string; city?: string }): string {
  const body =
    tlv('00', '01') +
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', a.key.trim())) +
    tlv('52', '0000') + tlv('53', '986') + tlv('54', (a.amountCents / 100).toFixed(2)) + tlv('58', 'BR') +
    tlv('59', clean(a.beneficiary, 25) || 'LOJA') + tlv('60', clean(a.city ?? 'Rio de Janeiro', 15) || 'BRASIL') +
    tlv('62', tlv('05', a.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) + '6304'
  return body + crc16(body)
}
