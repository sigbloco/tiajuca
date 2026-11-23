import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Cada Edge Function é publicada isolada (sem pasta compartilhada), então estes arquivos existem em mais de uma pasta.
// O teste impede que as cópias se afastem: mudou uma, mude as outras (a checagem de pagamento mora no verify.ts).
const GRUPOS: string[][] = [
  ['shop-checkout/infinitepay.ts', 'billing-pay-link/infinitepay.ts', 'shop-admin/infinitepay.ts'],
  ['shop-infinitepay-webhook/verify.ts', 'billing-infinitepay-webhook/verify.ts'],
]

const ler = (p: string) =>
  readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => !l.startsWith('// CÓPIA')).join('\n')

describe('cópias entre Edge Functions', () => {
  for (const [original, ...copias] of GRUPOS) {
    for (const c of copias) it(`${c} igual a ${original}`, () => expect(ler(c)).toBe(ler(original)))
  }
})
