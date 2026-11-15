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

/** Redes para escolher no formulário: nome e o começo do endereço do perfil. */
export const SOCIAL_NETWORKS: { key: string; label: string; base: string; at: boolean }[] = [
  { key: 'instagram', label: 'Instagram', base: 'https://instagram.com/', at: true },
  { key: 'tiktok', label: 'TikTok', base: 'https://www.tiktok.com/@', at: true },
  { key: 'facebook', label: 'Facebook', base: 'https://facebook.com/', at: false },
  { key: 'youtube', label: 'YouTube', base: 'https://youtube.com/@', at: true },
  { key: 'x', label: 'X (Twitter)', base: 'https://x.com/', at: true },
  { key: 'linkedin', label: 'LinkedIn', base: 'https://linkedin.com/in/', at: false },
]
/** Link do perfil a partir da rede e do usuário digitado ("@nome", "nome" ou link completo). */
export function networkUrl(network: string, user: string): string | null {
  const u = user.trim()
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  const n = SOCIAL_NETWORKS.find((x) => x.key === network) ?? SOCIAL_NETWORKS[0]
  const clean = u.replace(/^[@#]+/, '').replace(/\s+/g, '')
  return clean ? n.base + clean : null
}
/** Separa um link guardado em rede + usuário (para reabrir o que já foi digitado). */
export function splitNetwork(url: string): { network: string; user: string } {
  const strip = (u: string) => u.replace(/^(https?:\/\/)www\./i, '$1') // com ou sem www dá no mesmo
  const clean = strip(url)
  const n = SOCIAL_NETWORKS.find((x) => clean.toLowerCase().startsWith(strip(x.base).toLowerCase()))
  return n ? { network: n.key, user: clean.slice(strip(n.base).length) } : { network: 'instagram', user: url }
}

/** Lê o que foi digitado ("Instagram, TikTok, x") e devolve as chaves das redes conhecidas, mais o que não foi reconhecido. */
export function parseNetworks(text: string): { keys: string[]; unknown: string[] } {
  const keys: string[] = []
  const unknown: string[] = []
  for (const raw of text.split(/[,;\n]/)) {
    const t = raw.trim().toLowerCase()
    if (!t) continue
    const n = SOCIAL_NETWORKS.find((x) => x.key === t || x.label.toLowerCase() === t || (t === 'twitter' && x.key === 'x'))
    if (n) { if (!keys.includes(n.key)) keys.push(n.key) } else unknown.push(raw.trim())
  }
  return { keys, unknown }
}
