/**
 * Categoria de contribuição "Aluno": pela chave fixa (system_key = 'aluno') ou, nas categorias sem chave, pelo nome sem o qualificador
 * entre parênteses. Assim "Aluno (sopro)" e "Aluno (percussão)" são o mesmo tipo, mesmo que só uma delas tenha a chave fixa.
 */
const baseName = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function isAlunoCategory(c: { name: string; system_key?: string | null }): boolean {
  if (c.system_key) return c.system_key === 'aluno'
  return baseName(c.name) === 'aluno'
}
