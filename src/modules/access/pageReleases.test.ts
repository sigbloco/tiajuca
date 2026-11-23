import { describe, expect, it } from 'vitest'
import { categoriesOf, chainReleased, columnChanges, hasAnyPage, isReleasedFor, pageAccessible, pageKeyForPath, rawReleased, releasePage, RELEASE_PAGES, rowKey, type Access, type ReleaseRows } from './pageReleases'

const rows = (o: Record<string, boolean>): ReleaseRows => new Map(Object.entries(o))
const none = rows({})
const ativo: Access = { roles: ['integrante'], permissions: [{ key: 'events.read', scope: 'own' }] }

describe('padrão: igual a hoje', () => {
  it('sem nada gravado só a Direção tem as páginas liberadas', () => {
    expect(rawReleased(none, 'financeiro', 'direcao')).toBe(true)
    for (const c of ['professor', 'ativo', 'inativo'] as const) expect(rawReleased(none, 'inicio', c)).toBe(false)
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
  it('Direção vale por si; depois Professor/Monitor; inativo vence; o resto é ativo', () => {
    expect(categoriesOf({ roles: ['direcao', 'professor', 'integrante'] })).toEqual(['direcao'])
    expect(categoriesOf({ roles: ['professor', 'integrante'] })).toEqual(['professor'])
    expect(categoriesOf({ roles: ['monitor', 'integrante'] })).toEqual(['ativo']) // papel antigo não existe mais
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
  it('Organização é de quem administra (permissão, não nome do papel); Oficina existe se algum item for acessível', () => {
    const prof: Access = { roles: ['professor', 'integrante'], permissions: [{ key: 'attendance.record', scope: 'own' }, { key: 'suppliers.read', scope: 'org' }, { key: 'drive.read', scope: 'org' }] }
    expect(pageAccessible(releasePage('organizacao')!, prof)).toBe(false)
    expect(pageAccessible(releasePage('oficina')!, prof)).toBe(true)
    expect(pageAccessible(releasePage('oficina')!, ativo)).toBe(false)
    expect(pageAccessible(releasePage('organizacao')!, { ...prof, permissions: [...prof.permissions, { key: 'cycles.manage', scope: 'org' }] })).toBe(true)
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

describe('redirecionamentos (Oficina → Alunos)', () => {
  it('não tem caixa própria na tabela', () => expect(RELEASE_PAGES.some((p) => p.key === 'alunos')).toBe(false))
  it('vale Integrantes e depende da área Oficina', () => {
    const r = rows({ [rowKey('membros', 'ativo')]: true, [rowKey('oficina', 'ativo')]: true })
    expect(chainReleased(r, 'alunos', 'ativo')).toBe(true)
    expect(chainReleased(rows({ [rowKey('membros', 'ativo')]: true }), 'alunos', 'ativo')).toBe(false) // Oficina não liberada
    expect(chainReleased(rows({ [rowKey('oficina', 'ativo')]: true }), 'alunos', 'ativo')).toBe(false) // Integrantes não liberado
  })
  it('o caminho /oficina/alunos... é reconhecido (para o aviso de página não liberada)', () => expect(pageKeyForPath('alunos')).toBe('alunos'))
})
