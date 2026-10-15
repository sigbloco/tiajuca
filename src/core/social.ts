/** Normaliza o que a pessoa digitou ("@usuario", "instagram.com/x", link completo) para um link. Vazio → null. */
export function socialUrl(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim()
  if (!s || /^(-|n[aã]o uso\.?)$/i.test(s)) return null
  if (/^https?:\/\//i.test(s)) return s
  s = s.replace(/^(https?:\/\/)?(www\.)?/i, '')
  if (/^[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) return `https://${s}`
  s = s.replace(/^instagram\s*-?\s*/i, '').replace(/^[@#]+/, '').replace(/\s+/g, '')
  return s ? `https://instagram.com/${s}` : null
}

/** Texto curto para exibir o link: "@usuario" para Instagram, ou o domínio. */
export function socialLabel(url: string): string {
  const m = url.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i)
  if (m) return `@${m[1]}`
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}
