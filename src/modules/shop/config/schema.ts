import { z } from 'zod'

export const PAYMENT_METHODS = ['pix', 'infinitepay'] as const
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]

/**
 * Configuração ESTÁTICA da loja (arquivo). Nome, logo e cores vêm da organização; Pix, contatos, formas de pagamento e remetente dos
 * e-mails são editáveis no painel (Loja → Pagamentos e contatos) e ficam no banco; credenciais ficam nos segredos das Edge Functions.
 */
export const shopConfigSchema = z.object({
  orgSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** Horas que os itens ficam reservados aguardando o pagamento (o servidor aplica; aqui só para avisar o cliente). */
  reservationHours: z.number().int().min(1).max(24 * 30),
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
