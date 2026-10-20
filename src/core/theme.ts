import { areaOverrides, applyThemeVars, resolveColors, themeVars, type ThemeArea, type ThemeJson } from './themeModel'

/** Tema do bloco (JSON em `organizations.theme`). Veja `themeModel.ts` para as áreas Geral, Site e Loja. */
export type OrgTheme = ThemeJson

const CACHE_KEY = 'sigbloco:theme'

/** Variáveis da área, usando o texto antigo (primaryForeground…) só enquanto a cor não foi trocada na própria área. */
export function varsForArea(theme: ThemeJson, area: ThemeArea): Record<string, string> {
  const own = areaOverrides(theme, area)
  return themeVars(resolveColors(theme, area), {
    primary: own.primary ? undefined : theme.primaryForeground,
    secondary: own.secondary ? undefined : theme.secondaryForeground,
  })
}

/** Aplica o tema GERAL da organização como CSS variables. Cache só de cores (não sensível), para evitar flash. */
export function applyTheme(theme: OrgTheme | null | undefined, { cache = true } = {}) {
  if (!theme) return
  applyThemeVars(varsForArea(theme, 'general'))
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
