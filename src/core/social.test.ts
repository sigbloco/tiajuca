import { describe, expect, it } from 'vitest'
import { networkUrl, splitNetwork } from './social'

describe('redes sociais do formulário', () => {
  it('monta o link da rede a partir do usuário', () => {
    expect(networkUrl('instagram', '@cordao')).toBe('https://instagram.com/cordao')
    expect(networkUrl('tiktok', 'cordao')).toBe('https://www.tiktok.com/@cordao')
    expect(networkUrl('instagram', '  ')).toBeNull()
    expect(networkUrl('facebook', 'https://facebook.com/x')).toBe('https://facebook.com/x')
  })
  it('separa o link guardado em rede e usuário', () => {
    expect(splitNetwork('https://www.tiktok.com/@cordao')).toEqual({ network: 'tiktok', user: 'cordao' })
    expect(splitNetwork('qualquer coisa')).toEqual({ network: 'instagram', user: 'qualquer coisa' })
  })
})
