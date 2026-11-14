import { describe, expect, it } from 'vitest'
import { isToDeliver, summarizeItems } from './deliveryPdf'
import type { AdminOrder } from './ordersService'

const order = (p: Partial<AdminOrder>, items: Partial<AdminOrder['shop_order_items'][number]>[] = []) => ({
  status: 'paid', archived_at: null, shop_fulfillments: [{ status: 'pending' }],
  shop_order_items: items.map((i) => ({ product_name: 'Camisa', variant_label: 'M', quantity: 1, kind: 'stock', ...i })), ...p,
}) as unknown as AdminOrder

describe('pedidos a entregar', () => {
  it('pago com algo pendente entra; tudo retirado, cancelado ou arquivado não', () => {
    expect(isToDeliver(order({}))).toBe(true)
    expect(isToDeliver(order({ shop_fulfillments: [{ status: 'picked_up' }] as never }))).toBe(false)
    expect(isToDeliver(order({ status: 'cancelled' }))).toBe(false)
    expect(isToDeliver(order({ archived_at: '2026-11-01' }))).toBe(false)
  })
  it('sem pagamento confirmado entra (vai para a lista à parte)', () => {
    expect(isToDeliver(order({ status: 'awaiting_payment', shop_fulfillments: [] }))).toBe(true)
  })
  it('soma itens por produto e variação', () => {
    const s = summarizeItems([order({}, [{ quantity: 2 }]), order({}, [{ quantity: 3 }, { variant_label: 'G', quantity: 1 }])])
    expect(s).toEqual([{ label: 'Camisa (G)', qty: 1 }, { label: 'Camisa (M)', qty: 5 }])
  })
})
