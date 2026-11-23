export const PAYMENT_METHODS = ['pix', 'infinitepay'] as const
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]
