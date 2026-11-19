import { describe, expect, it } from 'vitest'
import { categoriesOf, chainReleased, columnChanges, hasAnyPage, isReleasedFor, pageAccessible, pageKeyForPath, rawReleased, releasePage, RELEASE_PAGES, rowKey, type Access, type ReleaseRows } from './releases'

const rows = (o: Record<string, boolean>): ReleaseRows => new Map(Object.entries(o))
const none = rows({})
const ativo: Access = { roles: ['integrante'], permissions: [{ key: 'events.read', scope: 'own' }] }

describe('padrão: igual a hoje', () => {
  it('sem nada gravado só a Direção tem as páginas liberadas', () => {
    expect(rawReleased(none, 'financeiro', 'direcao')).toBe(true)
    for (const c of ['professor', 'monitor', 'ativo', 'inativo'] as const) expect(rawReleased(none, 'inicio', c)).toBe(false)
  })
  it('o Titular vê tudo sempre', () => {
    expect(isReleasedFor(none, 'acesso', categoriesOf({ roles: ['titular', 'direcao'] }))).toBe(true)
  })
  it('categoria vazia de liberação: nenhuma página (aviso "nenhuma página liberada")', () => {
    expect(hasAnyPage(none, ativo, false)).toBe(false)
    expect(hasAnyPage(rows({ [rowKey('inicio', 'ativo')]: true }), ativo, false)).toBe(true)
  })
})

describe('categorias', () => {
  it('Direção vale por si; Professor e Monitor somam; inativo vence; o resto é ativo', () => {
    expect(categoriesOf({ roles: ['direcao', 'professor', 'integrante'] })).toEqual(['direcao'])
    expect(categoriesOf({ roles: ['professor', 'monitor', 'integrante'] })).toEqual(['professor', 'monitor'])
    expect(categoriesOf({ roles: ['integrante'] })).toEqual(['ativo'])
    expect(categoriesOf({ roles: [], inactive: true })).toEqual(['inativo'])
  })
})

describe('herança das áreas', () => {
  const r = rows({ [rowKey('organizacao', 'direcao')]: false, [rowKey('ciclos', 'direcao')]: true, [rowKey('oficina', 'professor')]: true, [rowKey('presenca', 'professor')]: true })
  it('área desmarcada apaga os itens mesmo marcados', () => expect(chainReleased(r, 'ciclos', 'direcao')).toBe(false))
  it('área marcada não libera os itens; cada um tem a sua caixa', () => {
    expect(chainReleased(r, 'presenca', 'professor')).toBe(true)
    expect(chainReleased(r, 'alunos', 'professor')).toBe(false)
  })
})

describe('acesso por permissão (a liberação nunca concede)', () => {
  it('página sem permissão exigida é sempre acessível; com permissão, só quem tem', () => {
    expect(pageAccessible(releasePage('inicio')!, ativo)).toBe(true)
    expect(pageAccessible(releasePage('eventos')!, ativo)).toBe(true)
    expect(pageAccessible(releasePage('membros')!, ativo)).toBe(false)
  })
  it('Organização é só da direção; Oficina existe se algum item for acessível', () => {
    const prof: Access = { roles: ['professor', 'integrante'], permissions: [{ key: 'attendance.record', scope: 'own' }, { key: 'cycles.manage', scope: 'org' }] }
    expect(pageAccessible(releasePage('organizacao')!, prof)).toBe(false)
    expect(pageAccessible(releasePage('oficina')!, prof)).toBe(true)
    expect(pageAccessible(releasePage('oficina')!, ativo)).toBe(false)
    expect(pageAccessible(releasePage('organizacao')!, { ...prof, roles: ['direcao'] })).toBe(true)
  })
})

describe('caminhos', () => {
  it('mapeia a URL para a página; Vagas é de Naipes; desconhecido não entra', () => {
    expect(pageKeyForPath('')).toBe('inicio')
    expect(pageKeyForPath('/eventos/configuracoes')).toBe('eventos')
    expect(pageKeyForPath('vagas')).toBe('naipes')
    expect(pageKeyForPath('presenca/abc')).toBe('presenca')
    expect(pageKeyForPath('inscricoes')).toBeNull()
  })
  it('todas as páginas têm chave única', () => {
    expect(new Set(RELEASE_PAGES.map((p) => p.key)).size).toBe(RELEASE_PAGES.length)
  })
  it('marcar a coluna só mexe nas células editáveis', () => {
    const ch = columnChanges('ativo', true, (p) => p.key === 'inicio' || p.key === 'perfil')
    expect(ch).toEqual([{ page: 'inicio', category: 'ativo', released: true }, { page: 'perfil', category: 'ativo', released: true }])
  })
})
