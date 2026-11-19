import { useLocation } from 'react-router-dom'
import { LoginPopup } from '@/modules/auth/LoginPopup'
import { useStore } from './StoreContext'

/** Login com o Google num popup (com X), sem sair da loja. Depois de entrar, o preço de integrante aparece na hora. */
export function LoginDialog() {
  const { loginOpen, setLoginOpen } = useStore()
  const { pathname } = useLocation()
  return (
    <LoginPopup open={loginOpen} onOpenChange={setLoginOpen} title="Entrar com o Google" returnTo={pathname}
      description="Preenchemos seus dados e você acompanha seus pedidos sem precisar de código (usamos só o nome e o e-mail da sua conta Google). Integrantes também veem os preços de integrante. Não é preciso entrar para comprar." />
  )
}
