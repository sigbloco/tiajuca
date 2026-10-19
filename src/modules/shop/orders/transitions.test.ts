import { describe, expect, it } from 'vitest'
import { canArchive, fulfillmentLabel, fulfillmentSteps, isTransitionAllowed, orderActions, type FulfillmentStatus } from './transitions'

describe('andamento de itens em estoque', () => {
  it('separando → pronto → retirado, sem passar por "em preparo"', () => {
    expect(fulfillmentSteps('stock', 'pending')).toEqual({ next: 'ready', back: null })
    expect(fulfillmentSteps('stock', 'ready')).toEqual({ next: 'picked_up', back: 'pending' })
    expect(fulfillmentSteps('stock', 'picked_up')).toEqual({ next: null, back: 'ready' })
    expect(isTransitionAllowed('stock', 'pending', 'in_preparation')).toBe(false)
  })
})

describe('andamento de itens sob encomenda', () => {
  it('na fila → em preparo → pronto → retirado', () => {
    expect(fulfillmentSteps('made_to_order', 'pending')).toEqual({ next: 'in_preparation', back: null })
    expect(fulfillmentSteps('made_to_order', 'in_preparation')).toEqual({ next: 'ready', back: 'pending' })
    expect(fulfillmentSteps('made_to_order', 'ready')).toEqual({ next: 'picked_up', back: 'in_preparation' })
  })
  it('não pula etapas', () => {
    expect(isTransitionAllowed('made_to_order', 'pending', 'ready')).toBe(false)
    expect(isTransitionAllowed('made_to_order', 'in_preparation', 'picked_up')).toBe(false)
  })
})

describe('cancelado e consistência', () => {
  it('grupo cancelado não anda', () => {
    expect(fulfillmentSteps('stock', 'cancelled')).toEqual({ next: null, back: null })
    expect(fulfillmentSteps('made_to_order', 'cancelled')).toEqual({ next: null, back: null })
  })
  it('só existe "em preparo" para encomenda', () => {
    const all: FulfillmentStatus[] = ['pending', 'in_preparation', 'ready', 'picked_up', 'cancelled']
    for (const from of all) for (const to of all) {
      if (isTransitionAllowed('stock', from, to)) expect([from, to]).not.toContain('in_preparation')
    }
  })
  it('rótulos mudam conforme o tipo', () => {
    expect(fulfillmentLabel('stock', 'pending')).toBe('Separando')
    expect(fulfillmentLabel('made_to_order', 'pending')).toBe('Na fila de produção')
    expect(fulfillmentLabel('stock', 'ready')).toBe('Pronto para retirada')
  })
})

describe('ações do pedido por status', () => {
  it('pagar só antes de pago; andar só depois de pago; reativar só cancelado', () => {
    expect(orderActions('awaiting_payment')).toEqual({ canMarkPaid: true, canCancel: true, canReactivate: false, canProgress: false })
    expect(orderActions('payment_review')).toEqual({ canMarkPaid: true, canCancel: true, canReactivate: false, canProgress: false })
    expect(orderActions('paid')).toEqual({ canMarkPaid: false, canCancel: true, canReactivate: false, canProgress: true })
    expect(orderActions('cancelled')).toEqual({ canMarkPaid: false, canCancel: false, canReactivate: true, canProgress: false })
  })
})

describe('arquivar pedidos', () => {
  it('só cancelado ou totalmente retirado; nunca com reserva de estoque ativa', () => {
    expect(canArchive('cancelled', [])).toBe(true)
    expect(canArchive('cancelled', [{ status: 'cancelled' }])).toBe(true)
    expect(canArchive('paid', [{ status: 'picked_up' }, { status: 'picked_up' }])).toBe(true)
    expect(canArchive('paid', [{ status: 'picked_up' }, { status: 'ready' }])).toBe(false)
    expect(canArchive('paid', [])).toBe(false)
    expect(canArchive('awaiting_payment', [{ status: 'pending' }])).toBe(false)
    expect(canArchive('payment_review', [{ status: 'pending' }])).toBe(false)
  })
})
