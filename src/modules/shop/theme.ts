import type { OrgTheme } from '@/core/theme'

/** Cor de texto legível (branco ou quase preto) sobre um fundo '#RRGGBB', pelo contraste de luminância (WCAG). */
export function readableForeground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  // Prefere branco (como nas cores de marca, ex.: vermelho) e só usa texto escuro em fundos realmente claros.
  return lum < 0.3 ? '#FFFFFF' : '#1A1A1A'
}

export const isHexColor = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v.trim())

/** Tema da loja = tema do bloco + cores próprias da loja (quando definidas). Os textos sobre as cores são calculados. */
export function buildShopTheme(base: OrgTheme | null | undefined, override: { primary?: string | null; secondary?: string | null } | null | undefined): OrgTheme {
  const theme: OrgTheme = { ...(base ?? {}) }
  if (override?.primary && isHexColor(override.primary)) { theme.primary = override.primary; theme.primaryForeground = readableForeground(override.primary) }
  if (override?.secondary && isHexColor(override.secondary)) { theme.secondary = override.secondary; theme.secondaryForeground = readableForeground(override.secondary) }
  return theme
}
