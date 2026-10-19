import { describe, expect, it } from 'vitest'
import { nextStepText, progressIndex, progressSteps, timelineLabel } from './customerView'

describe('histórico mostrado ao cliente', () => {
  it('traduz eventos do pedido e dos grupos, sem expor quem atendeu', () => {
    expect(timelineLabel({ scope: 'order', status: 'paid', kind: null, at: '' })).toBe('Pagamento confirmado')
    expect(timelineLabel({ scope: 'order', status: 'payment_review', kind: null, at: '' })).toBe('Pagamento informado — em conferência')
    expect(timelineLabel({ scope: 'fulfillment', status: 'ready', kind: 'stock', at: '' })).toBe('Pronta entrega: Pronto para retirada')
    expect(timelineLabel({ scope: 'fulfillment', status: 'in_preparation', kind: 'made_to_order', at: '' })).toBe('Sob encomenda: Em preparo')
  })
  it('status desconhecido não quebra', () => {
    expect(timelineLabel({ scope: 'order', status: 'xyz', kind: null, at: '' })).toBe('xyz')
    expect(timelineLabel({ scope: 'fulfillment', status: 'ready', kind: null, at: '' })).toBe('ready')
  })
})

describe('progresso por grupo', () => {
  it('pronta entrega tem 3 etapas; encomenda tem 4 (com "em preparo")', () => {
    expect(progressSteps('stock').map((s) => s.key)).toEqual(['pending', 'ready', 'picked_up'])
    expect(progressSteps('made_to_order').map((s) => s.key)).toEqual(['pending', 'in_preparation', 'ready', 'picked_up'])
  })
  it('acha a etapa atual; cancelado fica fora da barra', () => {
    expect(progressIndex('stock', 'ready')).toBe(1)
    expect(progressIndex('made_to_order', 'ready')).toBe(2)
    expect(progressIndex('stock', 'cancelled')).toBe(-1)
  })
})

describe('próximo passo', () => {
  it('orienta conforme status e método de pagamento', () => {
    expect(nextStepText('awaiting_payment', 'pix')).toContain('Já fiz o pagamento')
    expect(nextStepText('awaiting_payment', 'infinitepay')).toContain('InfinitePay')
    expect(nextStepText('payment_review', 'pix')).toContain('conferindo')
    expect(nextStepText('paid', 'pix')).toContain('prontos para retirada')
    expect(nextStepText('cancelled', 'pix')).toContain('cancelado')
  })
})
