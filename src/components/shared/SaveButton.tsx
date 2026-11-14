import { Save } from 'lucide-react'
import type { ComponentProps } from 'react'
import { FitButton } from './FitButton'

/** Botão "Salvar": ícone de disquete + o texto "Salvar" quando há espaço; sem espaço, só o ícone. */
export function SaveButton(props: Omit<ComponentProps<typeof FitButton>, 'icon' | 'label' | 'active'>) {
  return <FitButton icon={Save} label="Salvar" active {...props} />
}
