import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Globe, LogOut, Store } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { friendlyError } from '@/core/errors'
import { DEFAULT_ORG_SLUG, supabase } from '@/core/supabase'
import { AuthLayout } from './AuthLayout'

/** Única forma de entrar: conta Google. Quem chega ao bloco vem pelos formulários de inscrição, não por cadastro aberto. */
export function GoogleButton({ next }: { next?: string }) {
  const { signInWithGoogle } = useAuth()
  return (
    <Button type="button" variant="outline" className="w-full" onClick={() => signInWithGoogle(next).catch((e) => toast.error(friendlyError(e)))}>
      Continuar com Google
    </Button>
  )
}

export function ClaimInvitePage() {
  const { token = '' } = useParams()
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const claim = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('claim_member', { p_token: token })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Conta vinculada ao seu cadastro!')
      navigate('/', { replace: true })
    },
  })
  useEffect(() => {
    if (token) sessionStorage.setItem('sigbloco:pending-invite', token)
  }, [token])

  if (loading) return null
  if (!session) {
    return (
      <AuthLayout title="Você foi convidado" subtitle="Entre com a conta Google do e-mail do convite para vincular seu cadastro.">
        <GoogleButton next={`/convite/${token}`} />
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Aceitar convite" subtitle="Vincular a conta atual ao seu cadastro de integrante.">
      {claim.isError && <p className="mb-3 text-destructive">{friendlyError(claim.error)}</p>}
      <Button className="w-full" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? 'Vinculando' : 'Aceitar convite'}
      </Button>
    </AuthLayout>
  )
}

/**
 * Quem entra com o Google e ainda não tem cadastro ligado (ou é só integrante) vê sempre a tela "em construção":
 * a área dos integrantes ainda não está pronta. Dá para ir à loja ou ao site.
 */
export function NoOrganizationPage() {
  const { signOut } = useAuth()
  return (
    <AuthLayout title="Área em construção" subtitle="A área dos integrantes ainda está sendo construída. Em breve estará disponível por aqui.">
      <div className="space-y-2">
        <Button asChild className="w-full"><Link to={`/${DEFAULT_ORG_SLUG}/loja`}><Store className="h-4 w-4" /> Ir para a loja</Link></Button>
        <Button asChild variant="outline" className="w-full"><Link to="/site"><Globe className="h-4 w-4" /> Ver o site</Link></Button>
        <Button variant="ghost" className="w-full" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Sair</Button>
      </div>
    </AuthLayout>
  )
}
