import { Link } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'

/** Nome de naipe ou instrumento clicável: abre Integrantes já com esse grupo aberto. */
export function GroupLink({ naipe, inst, className, children }: { naipe?: string; inst?: string; className?: string; children: React.ReactNode }) {
  const { membership } = useOrganization()
  const q = new URLSearchParams()
  if (naipe) q.set('naipe', naipe)
  if (inst) q.set('inst', inst)
  return <Link to={`/${membership?.slug}/membros?${q.toString()}`} className={cn('hover:text-primary hover:underline', className)}>{children}</Link>
}
