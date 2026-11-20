/**
 * Endereço digitado em campo livre (site do fornecedor, guia da música, pasta do Drive) só vira link se for http(s).
 * Sem esquema ("www.exemplo.com", "exemplo.com/x") ganha https://. Qualquer outro esquema (javascript:, data:, file:…) é recusado.
 */
export function safeHttpUrl(raw: string | null | undefined): string | undefined {
  const s = (raw ?? '').trim()
  if (!s) return undefined
  if (/^https?:\/\//i.test(s)) return isValid(s) ? s : undefined
  // Tem esquema que não é http(s): recusa (inclui "javascript:" com espaços ou maiúsculas, que o navegador aceitaria).
  if (/^[a-z][a-z0-9+.-]*:/i.test(s.replace(/[\s\u0000-\u001f]/g, ''))) return undefined
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s)) return isValid(`https://${s}`) ? `https://${s}` : undefined
  return undefined
}

function isValid(u: string): boolean {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}
