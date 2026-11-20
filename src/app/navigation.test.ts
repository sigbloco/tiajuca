import { describe, expect, it } from 'vitest'
import type { GrantedPermission } from '@/core/permissions'
import { canOpenPath, hubVisible } from './navigation'

// Permissões reais dos papéis (mesmas do banco em 20/11/2026).
const integrante: GrantedPermission[] = [
  { key: 'attendance.read', scope: 'own' }, { key: 'billing.read', scope: 'own' }, { key: 'drive.read', scope: 'org' },
  { key: 'events.read', scope: 'org' }, { key: 'members.read', scope: 'own' }, { key: 'repertoire.read', scope: 'org' },
]
const professor: GrantedPermission[] = [
  { key: 'attendance.read', scope: 'group' }, { key: 'attendance.record', scope: 'group' }, { key: 'billing.read', scope: 'own' },
  { key: 'capacity.read', scope: 'org' }, { key: 'drive.read', scope: 'org' }, { key: 'events.read', scope: 'org' },
  { key: 'member_cycles.read', scope: 'group' }, { key: 'members.read', scope: 'group' }, { key: 'pix.manage', scope: 'own' },
  { key: 'repertoire.read', scope: 'org' }, { key: 'staff_payments.read', scope: 'own' }, { key: 'suppliers.read', scope: 'org' },
]
const KEYS = ['org.manage', 'settings.manage', 'roles.manage', 'backups.manage', 'members.read', 'members.manage', 'audit.read', 'structure.manage', 'cycles.manage',
  'member_cycles.read', 'capacity.read', 'events.read', 'events.manage', 'checklists.manage', 'attendance.read', 'attendance.record', 'billing.read', 'billing.manage',
  'scholarships.manage', 'finance.read', 'finance.manage', 'repertoire.read', 'forms.manage', 'suppliers.read', 'suppliers.manage', 'drive.read', 'drive.manage', 'shop.manage'] as const
const direcao: GrantedPermission[] = KEYS.map((key) => ({ key, scope: 'org' }))

describe('acesso por URL (mesma regra do menu)', () => {
  it('integrante: abre o que é dele, é barrado no resto', () => {
    for (const ok of ['', 'perfil', 'eventos', 'repertorio', 'repertorio/abc', 'naipes', 'naipes/organograma']) expect(canOpenPath(ok, integrante)).toBe(true)
    for (const no of ['acesso', 'auditoria', 'site', 'interface', 'gerenciar-loja', 'formularios', 'formularios/configuracoes', 'receitas', 'ciclos', 'funcoes', 'presenca', 'relatorios', 'organizacao', 'oficina', 'naipes/configuracoes', 'eventos/configuracoes', 'vagas'])
      expect(canOpenPath(no, integrante), no).toBe(false)
  })
  it('professor: Oficina e presença sim; administração e configurações não', () => {
    for (const ok of ['oficina', 'presenca', 'presenca/xyz', 'relatorios', 'lista-de-espera', 'vagas', 'fornecedores', 'drive']) expect(canOpenPath(ok, professor), ok).toBe(true)
    expect(canOpenPath('financeiro', professor)).toBe(true) // Cobranças próprias
    for (const no of ['organizacao', 'receitas', 'valores', 'acesso', 'eventos/configuracoes', 'naipes/configuracoes', 'formularios/configuracoes/listas', 'ciclos'])
      expect(canOpenPath(no, professor), no).toBe(false)
  })
  it('direção abre tudo', () => {
    for (const ok of ['organizacao', 'financeiro', 'acesso', 'auditoria', 'formularios/configuracoes/modelos/1', 'eventos/configuracoes', 'naipes/configuracoes']) expect(canOpenPath(ok, direcao), ok).toBe(true)
  })
  it('papel customizado com forms.manage abre as configurações de formulários (antes era só pelo nome do papel)', () => {
    expect(canOpenPath('formularios/configuracoes', [{ key: 'forms.manage', scope: 'org' }])).toBe(true)
  })
  it('Organização só para quem administra algo dela', () => {
    expect(hubVisible('organizacao', professor)).toBe(false)
    expect(hubVisible('organizacao', [...professor, { key: 'suppliers.manage', scope: 'org' }])).toBe(true)
  })
})
