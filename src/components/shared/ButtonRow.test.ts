import { describe, expect, it } from 'vitest'
import { pickRows, rowCandidates } from './ButtonRow'

describe('rowCandidates', () => {
  it('nunca deixa um botão sozinho embaixo de linhas maiores (menos com 3)', () => {
    expect(rowCandidates(5)).toEqual([[5], [3, 2], [2, 3], [1, 1, 1, 1, 1]])
    expect(rowCandidates(4)).toEqual([[4], [2, 2], [1, 1, 1, 1]])
    expect(rowCandidates(3)).toEqual([[3], [2, 1], [1, 1, 1]])
    expect(rowCandidates(6)).toEqual([[6], [3, 3], [2, 2, 2], [1, 1, 1, 1, 1, 1]])
  })
})

describe('pickRows', () => {
  it('cabendo, tudo numa linha', () => {
    expect(pickRows([80, 80, 80], 339, 8)).toEqual([3])
  })
  it('5 botões: 3 curtos em cima e 2 longos embaixo, em vez de um por linha', () => {
    expect(pickRows([90, 95, 92, 100, 160], 339, 8)).toEqual([3, 2])
  })
  it('5 botões: tenta 2 + 3 quando os longos vêm primeiro', () => {
    expect(pickRows([160, 150, 90, 95, 92], 339, 8)).toEqual([2, 3])
  })
  it('6 botões quebram em 3 + 3, não em 4 + 2', () => {
    expect(pickRows([75, 75, 75, 75, 75, 75], 339, 8)).toEqual([3, 3])
  })
  it('nada cabe: um por linha', () => {
    expect(pickRows([200, 200, 200], 339, 8)).toEqual([1, 1, 1])
  })
})
