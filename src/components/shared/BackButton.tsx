import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'

/** Volta para a página anterior; se a pessoa chegou direto por um link (sem histórico), vai para `fallback`. */
export function BackButton({ fallback, label = 'Voltar', className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate()
  const hasHistory = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  return (
    <button type="button" onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      className={cn('mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-primary hover:bg-muted', className)}>
      <ArrowLeft className="h-5 w-5" aria-hidden /> {label}
    </button>
  )
}
