import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'

/** Leva à página "mãe" e diz o nome dela: "Voltar para a página inicial", "Voltar para Repertório"… */
export function BackButton({ to, name, className }: { to: string; name: string; className?: string }) {
  return (
    <Link to={to} className={cn('mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-primary hover:bg-muted', className)}>
      <ArrowLeft className="h-5 w-5" aria-hidden /> Voltar para {name}
    </Link>
  )
}
