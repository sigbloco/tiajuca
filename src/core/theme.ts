export interface OrgTheme {
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
}

const CACHE_KEY = 'sigbloco:theme'

function hexToChannels(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

const MAP: Record<keyof OrgTheme, string> = {
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
}

/** Aplica o tema da organização como CSS variables. Cache só de cores (não sensível), para evitar flash. */
export function applyTheme(theme: OrgTheme | null | undefined, { cache = true } = {}) {
  if (!theme) return
  const root = document.documentElement
  for (const key of Object.keys(MAP) as (keyof OrgTheme)[]) {
    const channels = theme[key] ? hexToChannels(theme[key] as string) : null
    if (channels) root.style.setProperty(MAP[key], channels)
  }
  if (cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(theme))
    } catch {
      /* armazenamento indisponível: ignorar */
    }
  }
}

export function applyCachedTheme() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) applyTheme(JSON.parse(raw) as OrgTheme, { cache: false })
  } catch {
    /* ignorar */
  }
}
