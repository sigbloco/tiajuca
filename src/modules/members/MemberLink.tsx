import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { cn } from '@/components/ui/primitives'

/** Nome de um integrante que leva à ficha dele (Integrantes → abre a ficha). Sem permissão de ver integrantes, vira texto comum. */
export function MemberLink({ id, children, className }: { id?: string | null; children: ReactNode; className?: string }) {
  const { membership } = useOrganization()
  const can = usePermission('members.read', 'group')
  if (!id || !can || !membership) return <>{children}</>
  return <Link to={`/${membership.slug}/membros?m=${id}`} className={cn('hover:underline', className)} onClick={(e) => e.stopPropagation()}>{children}</Link>
}
