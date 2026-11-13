import { Link } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'

/** Regra do app todo: texto que cita uma página leva a ela. `to` é o caminho dentro do bloco (ex.: "funcoes", "naipes/configuracoes"). */
export function PageLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const { membership } = useOrganization()
  return <Link to={`/${membership?.slug}/${to}`} className={cn('font-semibold text-primary hover:underline', className)}>{children}</Link>
}
