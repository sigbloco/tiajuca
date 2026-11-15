import { describe, expect, it } from 'vitest'
import { genderOf, participationLine } from './participationLine'

const base = { blocName: 'Tia Juca', gender: null, artistic: [], staff: [], functions: [] }
describe('participationLine', () => {
  it('instrumento e naipe', () => expect(participationLine({ ...base, artistic: [{ name: 'Sax Tenor', section: 'Sopro' }] })).toBe('Sax Tenor no sopro da Tia Juca'))
  it('instrumento + colaboração', () => expect(participationLine({ ...base, gender: 'f', artistic: [{ name: 'Clarinete', section: 'Sopro' }], functions: ['Escritora'] })).toBe('Clarinete no sopro da Tia Juca e escritora'))
  it('professora e regente', () => expect(participationLine({ ...base, gender: 'f', staff: [{ kind: 'professor', instrument: 'Tamborim', section: null }, { kind: 'regente', instrument: null, section: 'Percussão' }] })).toBe('Professora de tamborim e regente na percussão da Tia Juca'))
  it('redes sociais depois do instrumento', () => expect(participationLine({ ...base, artistic: [{ name: 'Caixa de guerra', section: 'Percussão' }], functions: ['Redes sociais'] })).toBe('Caixa de guerra na percussão da Tia Juca e redes sociais'))
  it('direção vira diretor/diretora e neutro', () => {
    expect(participationLine({ ...base, gender: 'm', artistic: [{ name: 'Sax Tenor', section: 'Sopro' }], functions: ['Direção'] })).toBe('Sax Tenor no sopro da Tia Juca e diretor')
    expect(participationLine({ ...base, artistic: [{ name: 'Pernalta', section: 'Performance' }], functions: ['Direção'] })).toBe('Pernalta na performance da Tia Juca e diretor(a)')
  })
  it('não repete o que a equipe já diz', () => expect(participationLine({ ...base, staff: [{ kind: 'monitor', instrument: 'Surdo', section: null }], functions: ['Monitor'] })).toBe('Monitor(a) de surdo da Tia Juca'))
  it('vazio', () => expect(participationLine(base)).toBe(''))
  it('gênero', () => { expect(genderOf('feminino')).toBe('f'); expect(genderOf('Mulher')).toBe('f'); expect(genderOf('masculino')).toBe('m'); expect(genderOf('nao_binario')).toBeNull(); expect(genderOf(null)).toBeNull() })
})
