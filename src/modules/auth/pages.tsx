import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { friendlyError } from '@/core/errors'
import { supabase } from '@/core/supabase'
import { AuthLayout } from './AuthLayout'

function Field({ id, label, ...props }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  )
}

function GoogleButton() {
  const { signInWithGoogle } = useAuth()
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => signInWithGoogle().catch((e) => toast.error(friendlyError(e)))}
    >
      Continuar com Google
    </Button>
  )
}

const Divider = () => <p className="my-3 text-center text-xs text-muted-foreground">ou</p>

export function LoginPage() {
  const { signIn, session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => signIn(email.trim(), password),
    onError: (e) => toast.error(friendlyError(e)),
  })
  const [params] = useSearchParams()
  // `voltar`: só caminhos internos (evita redirecionar para outro site depois do login).
  const back = params.get('voltar') ?? ''
  if (session) return <Navigate to={back.startsWith('/') && !back.startsWith('//') ? back : '/'} replace />
  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }
  return (
    <AuthLayout title="Entrar" subtitle="Acesse com seu e-mail e senha.">
      <form onSubmit={submit} className="space-y-3">
        <Field id="email" label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <Divider />
      <GoogleButton />
      <div className="mt-4 flex justify-between text-sm">
        <Link className="text-primary hover:underline" to="/recuperar-senha">Esqueci a senha</Link>
        <Link className="text-primary hover:underline" to="/cadastro">Criar conta</Link>
      </div>
    </AuthLayout>
  )
}

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signup = useMutation({
    mutationFn: () => signUp(email.trim(), password, fullName.trim()),
    onSuccess: ({ needsVerification }) => {
      if (needsVerification) navigate('/verifique-seu-email', { state: { email } })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <AuthLayout title="Criar conta" subtitle="Depois de criar a conta, a Direção vincula você ao seu cadastro.">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          signup.mutate()
        }}
        className="space-y-3"
      >
        <Field id="name" label="Nome completo" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Field id="email" label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Senha (mín. 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <Divider />
      <GoogleButton />
      <p className="mt-4 text-sm">
        Já tem conta? <Link className="text-primary hover:underline" to="/entrar">Entrar</Link>
      </p>
    </AuthLayout>
  )
}

export function VerifyEmailPage() {
  return (
    <AuthLayout title="Verifique seu e-mail" subtitle="Enviamos um link de confirmação. Abra-o para ativar sua conta e depois entre.">
      <Button asChild className="w-full"><Link to="/entrar">Ir para o login</Link></Button>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const reset = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    onSuccess: () => setSent(true),
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <AuthLayout title="Recuperar senha" subtitle="Informe seu e-mail para receber o link de redefinição.">
      {sent ? (
        <p>Se o e-mail estiver cadastrado, você receberá o link em instantes.</p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); reset.mutate() }} className="space-y-3">
          <Field id="email" label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" disabled={reset.isPending}>Enviar link</Button>
        </form>
      )}
      <Link className="mt-4 block text-sm text-primary hover:underline" to="/entrar">Voltar ao login</Link>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { updatePassword, session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const update = useMutation({
    mutationFn: () => updatePassword(password),
    onSuccess: () => {
      toast.success('Senha redefinida com sucesso.')
      navigate('/', { replace: true })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!loading && !session) {
    return (
      <AuthLayout title="Link inválido" subtitle="O link expirou ou já foi usado.">
        <Button asChild className="w-full"><Link to="/recuperar-senha">Solicitar novo link</Link></Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Nova senha" subtitle="Escolha uma nova senha para sua conta.">
      <form onSubmit={(e) => { e.preventDefault(); update.mutate() }} className="space-y-3">
        <Field id="password" label="Nova senha (mín. 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={update.isPending}>Salvar nova senha</Button>
      </form>
    </AuthLayout>
  )
}

/** /convite/:token — vincula a conta logada ao cadastro existente (RPC claim_member). */
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
      <AuthLayout title="Você foi convidado" subtitle="Entre ou crie sua conta com o e-mail do convite para vincular seu cadastro.">
        <div className="space-y-2">
          <Button asChild className="w-full"><Link to="/entrar">Entrar</Link></Button>
          <Button asChild variant="outline" className="w-full"><Link to="/cadastro">Criar conta</Link></Button>
        </div>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Aceitar convite" subtitle="Vincular a conta atual ao seu cadastro de integrante.">
      {claim.isError && <p className="mb-3 text-destructive">{friendlyError(claim.error)}</p>}
      <Button className="w-full" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? 'Vinculando…' : 'Aceitar convite'}
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
