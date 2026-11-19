export type CategoryType = 'aluno' | 'senior' | 'musico' | 'isento'
export const CATEGORY_TYPES: { key: CategoryType; label: string }[] = [
  { key: 'aluno', label: 'Aluno' }, { key: 'senior', label: 'Sênior' }, { key: 'musico', label: 'Músico' }, { key: 'isento', label: 'Isento' },
]

const baseName = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const BY_NAME: Record<string, CategoryType> = { aluno: 'aluno', senior: 'senior', isento: 'isento' }

/**
 * Tipo da categoria de contribuição: o campo Tipo (base_key), depois a chave fixa antiga (system_key) e, só para as que ainda não têm
 * nenhum dos dois, o nome sem o qualificador entre parênteses ("Aluno (percussão)" vale Aluno).
 */
export function categoryType(c: { name: string; base_key?: string | null; system_key?: string | null }): CategoryType | undefined {
  const k = c.base_key ?? c.system_key
  if (k === 'aluno' || k === 'senior' || k === 'musico' || k === 'isento') return k
  const n = baseName(c.name)
  return BY_NAME[n] ?? (n.startsWith('musico') ? 'musico' : undefined)
}

export const isAlunoCategory = (c: { name: string; base_key?: string | null; system_key?: string | null }): boolean => categoryType(c) === 'aluno'
