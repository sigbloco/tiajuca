import { Settings } from 'lucide-react'
import type { ComponentProps } from 'react'
import { FitButton } from './FitButton'

/** Botão de Configurações. Havendo espaço: ícone + "Configurações"; faltando: ícone + "Config."; faltando mais: só o ícone. */
export function SettingsButton(props: { to?: string; active?: boolean } & Omit<ComponentProps<typeof FitButton>, 'icon' | 'label' | 'shortLabel'>) {
  return <FitButton icon={Settings} label="Configurações" shortLabel="Config." {...props} />
}
