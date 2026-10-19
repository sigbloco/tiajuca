import { z } from 'zod'

export const PAYMENT_METHODS = ['pix', 'infinitepay'] as const
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]

/** Valor que ainda precisa ser preenchido pelo bloco. `findPendingFields` lista o que falta. */
export const PENDING = 'A-DEFINIR'

const digits = (min: number, max: number) => z.string().regex(new RegExp(`^[0-9]{${min},${max}}$`), 'Somente dígitos, com DDI e DDD')

/** Nome, logo e cores NÃO ficam aqui: vêm da organização (tema já aplicado pelo app). Credenciais ficam no .env/secrets. */
export const shopConfigSchema = z.object({
  orgSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  reservationHours: z.number().int().min(1).max(24 * 30),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).refine((a) => new Set(a).size === a.length, 'Métodos repetidos'),
  pix: z.object({ key: z.string().min(1), beneficiary: z.string().min(1) }),
  contact: z.object({
    whatsapp: z.union([z.literal(PENDING), digits(12, 13)]),
    email: z.union([z.literal(PENDING), z.email()]),
    /** Pessoas da Direção com quem o cliente pode falar direto no WhatsApp. */
    directors: z.array(z.object({ name: z.string().min(1), whatsapp: digits(12, 13) })).default([]),
  }),
  mail: z.object({ fromName: z.string().min(1), fromEmail: z.union([z.literal(PENDING), z.email()]) }),
})
export type ShopConfig = z.infer<typeof shopConfigSchema>

export function parseShopConfig(raw: unknown): ShopConfig {
  const r = shopConfigSchema.safeParse(raw)
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ')
    throw new Error(`Configuração da loja inválida — ${detail}`)
  }
  return r.data
}

/** Campos ainda com o valor provisório. A loja só deve vender com a lista vazia. */
export function findPendingFields(c: ShopConfig): string[] {
  const out: string[] = []
  const check = (path: string, v: string) => { if (v === PENDING) out.push(path) }
  if (c.paymentMethods.includes('pix')) { check('pix.key', c.pix.key); check('pix.beneficiary', c.pix.beneficiary) }
  check('contact.whatsapp', c.contact.whatsapp)
  check('contact.email', c.contact.email)
  check('mail.fromEmail', c.mail.fromEmail)
  return out
}
