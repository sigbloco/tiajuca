import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { friendlyError } from '@/core/errors'

/** Login sempre em popup (com X), em qualquer página pública. Quando a sessão começa, fecha sozinho e chama `onSignedIn`. */
export function LoginPopup({ open, onOpenChange, title = 'Entrar', description = 'Acesso de integrantes, professores, monitores e Direção.', returnTo = '/', successMessage, onSignedIn }: {
  open: boolean; onOpenChange: (o: boolean) => void; title?: string; description?: string; returnTo?: string; successMessage?: string; onSignedIn?: () => void
}) {
  const { signInWithGoogle, session } = useAuth()

  useEffect(() => {
    if (session && open) { onOpenChange(false); onSignedIn?.() }
  }, [session, open]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <Button type="button" className="mt-5 w-full" onClick={() => signInWithGoogle(returnTo).then(() => { if (successMessage) toast.success(successMessage) }).catch((e) => toast.error(friendlyError(e)))}>Continuar com Google</Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
