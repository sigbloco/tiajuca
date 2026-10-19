import { describe, expect, it } from 'vitest'
import { RETENTION_YEARS, buildPrivacyNotice } from './privacy'

const text = (s: ReturnType<typeof buildPrivacyNotice>) => s.flatMap((x) => [x.title, ...x.paragraphs]).join('\n')

describe('aviso de privacidade', () => {
  const full = text(buildPrivacyNotice('Cordão da Tia Juca', { whatsapp: '5521990698483', email: 'contato@ex.com' }))
  it('cobre os pontos da LGPD: dados, finalidade, compartilhamento, prazo e direitos', () => {
    for (const part of ['Quais dados coletamos', 'Para que usamos', 'Com quem compartilhamos', 'Por quanto tempo guardamos', 'Seus direitos']) expect(full).toContain(part)
    expect(full).toContain('Supabase')
    expect(full).toContain('InfinitePay')
    expect(full).toContain('Não guardamos dados de cartão')
    expect(full).toContain(`${RETENTION_YEARS} anos`)
  })
  it('usa o nome do bloco e os canais de atendimento configurados', () => {
    expect(full).toContain('loja do Cordão da Tia Juca')
    expect(full).toContain('e-mail contato@ex.com ou WhatsApp +5521990698483')
  })
  it('sem canais configurados manda falar com a Direção', () => {
    const none = text(buildPrivacyNotice('Bloco', { whatsapp: null, email: null }))
    expect(none).toContain('fale com a Direção do bloco')
    expect(buildPrivacyNotice('Bloco', { whatsapp: null, email: 'a@b.co' }).at(-1)?.paragraphs.at(-1)).toBe('Para isso, fale com a gente pelo e-mail a@b.co.')
  })
})
