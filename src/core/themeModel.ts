/**
 * Modelo de cores da interface. Três ÁREAS:
 *   • geral  → o sistema todo (admin, inscrições, login…); guardado no topo de `organizations.theme`;
 *   • site   → a página inicial pública; sobrepõe o geral só onde tiver cor própria (`theme.site`);
 *   • loja   → a vitrine pública; idem (`theme.shop`).
 * Cada área tem cinco cores editáveis; o texto sobre cada uma (e fundos de apoio, bordas) é calculado para ficar legível.
 */
export interface ThemeColors {
  /** Botões e destaques principais. */
  primary?: string | null
  /** Destaque secundário. */
  secondary?: string | null
  /** Fundo principal da página. */
  background?: string | null
  /** Cartões e caixas. */
  card?: string | null
  /** Cabeçalho (e menu lateral, no admin). */
  header?: string | null
}
export type ColorKey = keyof ThemeColors
export type ThemeArea = 'general' | 'site' | 'shop'

export interface ThemeJson extends ThemeColors {
  primaryForeground?: string
  secondaryForeground?: string
  palette?: string[]
  site?: ThemeColors
  shop?: ThemeColors
}

export const COLOR_SLOTS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'primary', label: 'Botões e destaques', hint: 'Cor dos botões principais, links e seleções.' },
  { key: 'secondary', label: 'Cor de apoio', hint: 'Selos, avisos e detalhes.' },
  { key: 'background', label: 'Fundo principal', hint: 'Fundo atrás de tudo.' },
  { key: 'card', label: 'Cartões e caixas', hint: 'Fundo das caixas de conteúdo.' },
  { key: 'header', label: 'Cabeçalho', hint: 'Topo da página (e menu lateral no admin).' },
]

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v.trim())

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.trim().slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
const channels = (hex: string) => rgb(hex).join(' ')

/** Texto (quase preto ou branco) que contrasta com o fundo — mesma regra usada no resto do app. */
export function textOn(hex: string): string {
  if (!isHex(hex)) return '#ffffff'
  const [r, g, b] = rgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1c1c14' : '#ffffff'
}

/** Mistura `a` com `b` (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)]
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

const clean = (c: ThemeColors | undefined | null): ThemeColors => {
  const out: ThemeColors = {}
  for (const { key } of COLOR_SLOTS) { const v = c?.[key]; if (isHex(v)) out[key] = v.trim().toUpperCase() }
  return out
}

/** Só o que foi escolhido para a área (sem herdar nada). */
export function areaOverrides(theme: ThemeJson | null | undefined, area: ThemeArea): ThemeColors {
  if (!theme) return {}
  return clean(area === 'general' ? theme : area === 'site' ? theme.site : theme.shop)
}

/** Cores valendo na área: as do geral, sobrepostas pelas da própria área. */
export function resolveColors(theme: ThemeJson | null | undefined, area: ThemeArea): ThemeColors {
  return { ...areaOverrides(theme, 'general'), ...(area === 'general' ? {} : areaOverrides(theme, area)) }
}

/** Variáveis CSS (canais "r g b") para as cores dadas. Só emite o que foi definido; o resto fica no padrão do sistema. */
export function themeVars(c: ThemeColors, explicitForeground?: { primary?: string; secondary?: string }): Record<string, string> {
  const v: Record<string, string> = {}
  const set = (name: string, hex: string) => { v[name] = channels(hex) }
  if (c.primary) { set('--primary', c.primary); set('--primary-foreground', explicitForeground?.primary && isHex(explicitForeground.primary) ? explicitForeground.primary : textOn(c.primary)) }
  if (c.secondary) { set('--secondary', c.secondary); set('--secondary-foreground', explicitForeground?.secondary && isHex(explicitForeground.secondary) ? explicitForeground.secondary : textOn(c.secondary)) }
  if (c.background) {
    const fg = textOn(c.background)
    set('--background', c.background); set('--foreground', fg)
    set('--muted', mix(c.background, fg, 0.07)); set('--muted-foreground', mix(fg, c.background, 0.4)); set('--border', mix(c.background, fg, 0.14))
  }
  // Sem cor própria, cartões e cabeçalho acompanham o tom do fundo (claro → branco; escuro → um pouco mais claro que o fundo).
  const derived = c.background ? (textOn(c.background) === '#1c1c14' ? '#FFFFFF' : mix(c.background, '#FFFFFF', 0.08)) : undefined
  const card = c.card ?? derived
  const header = c.header ?? derived
  if (card) { set('--card', card); set('--card-foreground', textOn(card)) }
  if (header) { set('--header', header); set('--header-foreground', textOn(header)) }
  return v
}

export const MANAGED_VARS = [
  '--primary', '--primary-foreground', '--secondary', '--secondary-foreground', '--background', '--foreground',
  '--muted', '--muted-foreground', '--border', '--card', '--card-foreground', '--header', '--header-foreground',
] as const

/**
 * Aplica as variáveis no elemento (padrão: <html>), tirando as que a área não define. Devolve uma função que restaura
 * exatamente o que havia antes — usada ao sair da loja/do site, para o sistema voltar às cores gerais.
 */
export function applyThemeVars(vars: Record<string, string>, el: HTMLElement = document.documentElement): () => void {
  const before = new Map<string, string>(MANAGED_VARS.map((n) => [n, el.style.getPropertyValue(n)]))
  for (const name of MANAGED_VARS) {
    if (vars[name]) el.style.setProperty(name, vars[name])
    else el.style.removeProperty(name)
  }
  return () => { for (const [n, val] of before) { if (val) el.style.setProperty(n, val); else el.style.removeProperty(n) } }
}

/** Grava as cores de uma área dentro do JSON do tema, sem mexer nas outras (vazio/nulo = volta ao padrão). */
export function withAreaColors(theme: ThemeJson | null | undefined, area: ThemeArea, colors: ThemeColors): ThemeJson {
  const base: ThemeJson = { ...(theme ?? {}) }
  const next = clean(colors)
  if (area === 'general') {
    for (const { key } of COLOR_SLOTS) delete base[key]
    Object.assign(base, next)
    // Textos sobre as cores principais ficam coerentes com as cores novas (o sistema antigo lê estes campos).
    if (next.primary) base.primaryForeground = textOn(next.primary); else delete base.primaryForeground
    if (next.secondary) base.secondaryForeground = textOn(next.secondary); else delete base.secondaryForeground
  } else if (Object.keys(next).length) base[area] = next
  else delete base[area]
  return base
}
