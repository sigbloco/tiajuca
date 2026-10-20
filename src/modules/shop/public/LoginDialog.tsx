import { useLocation } from 'react-router-dom'
import { LoginPopup } from '@/modules/auth/LoginPopup'
import { useStore } from './StoreContext'

/** Login de integrante num popup (com X), sem sair da loja. Depois de entrar, o preço de integrante aparece na hora. */
export function LoginDialog() {
  const { loginOpen, setLoginOpen } = useStore()
  const { pathname } = useLocation()
  return (
    <LoginPopup open={loginOpen} onOpenChange={setLoginOpen} title="Entrar como integrante" returnTo={pathname}
      description="Com a sua conta do app você vê os preços de integrante. Não é preciso entrar para comprar."
      successMessage="Você entrou. Os preços de integrante já estão valendo." />
  )
}
