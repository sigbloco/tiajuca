import * as Dialog from '@radix-ui/react-dialog'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { friendlyError } from '@/core/errors'

/** Login sempre em popup (com X), em qualquer página pública. Quando a sessão começa, fecha sozinho e chama `onSignedIn`. */
export function LoginPopup({ open, onOpenChange, title = 'Entrar', description = 'Acesso de integrantes, professores, monitores e Direção.', returnTo = '/', successMessage, onSignedIn }: {
  open: boolean; onOpenChange: (o: boolean) => void; title?: string; description?: string; returnTo?: string; successMessage?: string; onSignedIn?: () => void
}) {
  const { signIn, signInWithGoogle, session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (session && open) { onOpenChange(false); setPassword(''); onSignedIn?.() }
  }, [session, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useMutation({
    mutationFn: () => signIn(email.trim(), password),
    onSuccess: () => { if (successMessage) toast.success(successMessage) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-bold">{title}</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></Dialog.Close>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); login.mutate() }} className="mt-4 space-y-3">
            <div className="space-y-1.5"><Label htmlFor="lp-email">E-mail</Label>
              <Input id="lp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="lp-pass">Senha</Label>
              <Input id="lp-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={login.isPending}>{login.isPending ? 'Entrando…' : 'Entrar'}</Button>
          </form>
          <p className="my-3 text-center text-xs text-muted-foreground">ou</p>
          <Button type="button" variant="outline" className="w-full" onClick={() => signInWithGoogle(returnTo).catch((e) => toast.error(friendlyError(e)))}>Continuar com Google</Button>
          <div className="mt-4 flex justify-between text-sm">
            <Link className="text-primary hover:underline" to="/recuperar-senha">Esqueci a senha</Link>
            <Link className="text-primary hover:underline" to="/cadastro">Criar conta</Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
