import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safeUrl'

describe('safeHttpUrl', () => {
  it('aceita http(s) e completa endereço sem esquema', () => {
    expect(safeHttpUrl('https://drive.google.com/drive/folders/abc')).toBe('https://drive.google.com/drive/folders/abc')
    expect(safeHttpUrl(' http://exemplo.com ')).toBe('http://exemplo.com')
    expect(safeHttpUrl('www.exemplo.com.br')).toBe('https://www.exemplo.com.br')
    expect(safeHttpUrl('exemplo.com/som')).toBe('https://exemplo.com/som')
  })
  it('recusa outros esquemas e texto que não é endereço', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl(' JavaScript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('java\tscript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:text/html,oi')).toBeUndefined()
    expect(safeHttpUrl('mailto:a@b.com')).toBeUndefined()
    expect(safeHttpUrl('falar com João')).toBeUndefined()
    expect(safeHttpUrl('')).toBeUndefined()
    expect(safeHttpUrl(null)).toBeUndefined()
  })
})
