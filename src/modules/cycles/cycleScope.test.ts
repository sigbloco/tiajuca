import { describe, expect, it } from 'vitest'
import { isCycleIndependent } from './SelectedCycle'

describe('páginas que não dependem do ciclo', () => {
  it('formulários, repertório e configurações valem para todos os ciclos', () => {
    expect(isCycleIndependent(['formularios'])).toBe(true)
    expect(isCycleIndependent(['formularios', 'configuracoes', 'listas'])).toBe(true)
    expect(isCycleIndependent(['repertorio'])).toBe(true)
    expect(isCycleIndependent(['eventos', 'configuracoes'])).toBe(true)
    expect(isCycleIndependent(['naipes', 'configuracoes'])).toBe(true)
  })
  it('o resto continua com o menu de ciclo', () => {
    expect(isCycleIndependent([])).toBe(false)
    expect(isCycleIndependent(['eventos'])).toBe(false)
    expect(isCycleIndependent(['naipes'])).toBe(false)
    expect(isCycleIndependent(['naipes', 'organograma'])).toBe(false)
    expect(isCycleIndependent(['membros'])).toBe(false)
    expect(isCycleIndependent(['financeiro'])).toBe(false)
  })
})
