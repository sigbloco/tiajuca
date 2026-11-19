import { describe, expect, it } from 'vitest'
import { isAlunoCategory } from './categoryKind'

describe('categoria Aluno', () => {
  it('pela chave fixa, mesmo renomeada', () => expect(isAlunoCategory({ name: 'Estudante', system_key: 'aluno' })).toBe(true))
  it('categorias irmãs sem chave valem pelo nome sem o qualificador', () => {
    expect(isAlunoCategory({ name: 'Aluno (percussão)', system_key: null })).toBe(true)
    expect(isAlunoCategory({ name: 'aluno (Sopro)' })).toBe(true)
  })
  it('outras categorias não são Aluno', () => {
    expect(isAlunoCategory({ name: 'Senior', system_key: 'senior' })).toBe(false)
    expect(isAlunoCategory({ name: 'Pernalta', system_key: null })).toBe(false)
    expect(isAlunoCategory({ name: 'Aluno (x)', system_key: 'isento' })).toBe(false)
  })
})
