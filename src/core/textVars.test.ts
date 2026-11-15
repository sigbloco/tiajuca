import { describe, expect, it } from 'vitest'
import { fillVars } from './textVars'

describe('variáveis nos textos', () => {
  const vars = { whatsapp: '5521994263449', email: 'a@b.com', chave_pix: 'pix@x.com', vencimento: '10', valor_field: 'cat', prices: { c1: 50, c2: 150 } }
  it('troca as variáveis pelos valores do bloco', () => {
    expect(fillVars('Vence dia {vencimento}. Pix: {chave_pix}', vars)).toBe('Vence dia 10. Pix: pix@x.com')
    expect(fillVars('[Zap]({whatsapp_link}) ({whatsapp})', vars)).toBe('[Zap](https://wa.me/5521994263449) ((21) 99426-3449)')
  })
  it('{valor} acompanha a categoria escolhida', () => {
    expect(fillVars('Valor: {valor}', vars, {})).toBe('Valor: (escolha a categoria)')
    expect(fillVars('Valor: {valor}', vars, { cat: 'c2' }).replace(/\s/g, ' ')).toContain('150,00')
    expect(fillVars('Valor: {valor}', vars, { cat: 'outra' })).toBe('Valor: sem contribuição')
  })
  it('{valor:Categoria} usa o preço da categoria pelo nome ou pela chave', () => {
    const v = { ...vars, categories: [{ name: 'Aluno', key: 'aluno', price: 50 }, { name: 'Músico convidado', key: 'musico', price: 35 }] }
    expect(fillVars('Aluno: {valor:Aluno}', v).replace(/\s/g, ' ')).toContain('50,00')
    expect(fillVars('{valor:músico CONVIDADO}', v).replace(/\s/g, ' ')).toContain('35,00')
    expect(fillVars('{valor:musico}', v).replace(/\s/g, ' ')).toContain('35,00')
    expect(fillVars('{valor:Inexistente}', v)).toBe('{valor:Inexistente}')
  })
  it('sem valor, deixa a variável como está', () => {
    expect(fillVars('Pix: {chave_pix}', { whatsapp: null })).toBe('Pix: {chave_pix}')
    expect(fillVars('Valor: {valor}', { whatsapp: null }, {})).toBe('Valor: {valor}')
    expect(fillVars('Oi {nome}', vars)).toBe('Oi {nome}')
  })
})
