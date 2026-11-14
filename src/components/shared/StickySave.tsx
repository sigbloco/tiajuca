import type { ReactNode } from 'react'

/**
 * Rodapé fixo para o botão "Salvar" de uma página: acompanha a rolagem e fica sempre à vista na base da tela
 * (acima da barra inferior do celular). Ao chegar ao fim da página, assenta no lugar normal.
 */
export function StickySave({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[var(--bottombar-h,0px)] z-10 -mx-4 bg-background/95 px-4 pb-3 pt-3 shadow-[0_-6px_14px_-8px_rgba(0,0,0,0.3)] backdrop-blur md:-mx-8 md:px-8">
      {children}
    </div>
  )
}
