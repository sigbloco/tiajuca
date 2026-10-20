import { useEffect } from 'react'
import { varsForArea } from './theme'
import { applyThemeVars, type ThemeArea, type ThemeJson } from './themeModel'

/** Aplica as cores de uma área (site ou loja) enquanto a página está aberta e restaura as cores gerais ao sair. */
export function useAreaTheme(theme: ThemeJson | null | undefined, area: ThemeArea) {
  const key = JSON.stringify(theme ?? null)
  useEffect(() => {
    if (!theme) return
    return applyThemeVars(varsForArea(theme, area))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, area])
}
