import { describe, expect, it } from 'vitest'
import { fillVars } from './textVars'

describe('variáveis nos textos', () => {
  const vars = { whatsapp: '5521994263449', email: 'a@b.com', chave_pix: 'pix@x.com', vencimento: '10' }
  it('troca as variáveis pelos valores do bloco', () => {
    expect(fillVars('Vence dia {vencimento}. Pix: {chave_pix}', vars)).toBe('Vence dia 10. Pix: pix@x.com')
    expect(fillVars('[Zap]({whatsapp_link}) ({whatsapp})', vars)).toBe('[Zap](https://wa.me/5521994263449) ((21) 99426-3449)')
  })
  it('sem valor, deixa a variável como está', () => {
    expect(fillVars('Pix: {chave_pix}', { whatsapp: null })).toBe('Pix: {chave_pix}')
    expect(fillVars('Oi {nome}', vars)).toBe('Oi {nome}')
  })
})
