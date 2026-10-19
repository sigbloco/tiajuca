import { z } from 'zod'

export const PAYMENT_METHODS = ['pix', 'infinitepay'] as const
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]

/**
 * Configuração ESTÁTICA da loja (arquivo): só o identificador técnico da organização. TUDO o que o bloco vê e muda no dia a dia
 * (título, cores, textos, pagamentos, Pix, contatos, pontos de retirada e datas, prazos, remetente) é editado no painel
 * (Loja → Configurações) e fica no banco. Credenciais ficam nos segredos das Edge Functions.
 */
export const shopConfigSchema = z.object({
  orgSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
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
