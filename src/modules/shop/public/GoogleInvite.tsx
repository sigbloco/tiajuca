import { LogIn } from 'lucide-react'
import { Button, Card } from '@/components/ui/primitives'
import { useAuth } from '@/core/auth'
import { useStore } from './StoreContext'

/** Convite para entrar com o Google (só para quem não está logado). Comprar como visitante continua possível. */
export function GoogleInvite({ title, text }: { title: string; text: string }) {
  const { session } = useAuth()
  const { setLoginOpen } = useStore()
  if (session) return null
  return (
    <Card className="flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5 p-3">
      <LogIn className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <Button type="button" variant="outline" className="shrink-0 bg-card" onClick={() => setLoginOpen(true)}>Entrar com o Google</Button>
    </Card>
  )
}
