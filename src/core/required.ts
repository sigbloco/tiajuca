import { toast } from 'sonner'

/**
 * Aviso de campos obrigatórios: ao tentar salvar/criar com algo faltando, lista o que falta e devolve false.
 * Uso: `if (!requireFields([['Nome', f.name.trim()], ['Data', f.date]])) return`.
 */
export function requireFields(fields: [label: string, ok: unknown][]): boolean {
  const missing = fields.filter(([, ok]) => !ok).map(([label]) => label)
  if (missing.length === 0) return true
  toast.error(`Preencha: ${missing.join(', ')}.`)
  return false
}
