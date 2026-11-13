import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { friendlyError } from '@/core/errors'
import { supabase } from '@/core/supabase'
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

export function NoOrganizationPage() {
  const { signOut } = useAuth()
  return (
    <AuthLayout title="Aguardando vínculo" subtitle="Sua conta ainda não está ligada a um cadastro. Peça um convite à Direção ou abra o link de convite recebido.">
      <Button variant="outline" className="w-full" onClick={() => signOut()}>Sair</Button>
    </AuthLayout>
  )
}
