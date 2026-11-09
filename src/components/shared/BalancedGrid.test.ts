import { describe, expect, it } from 'vitest'
import { balancedCols } from './BalancedGrid'

describe('balancedCols', () => {
  it('distribui as caixas sem deixar uma sozinha quando dá', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9].map((n) => balancedCols(n))).toEqual([1, 2, 3, 2, 3, 3, 2, 3])
  })
  it('respeita o máximo de colunas', () => {
    expect(balancedCols(6, 2)).toBe(2)
  })
})
