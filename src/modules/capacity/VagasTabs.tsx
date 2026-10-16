import { NavLink } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'

/** Vagas e Lista de espera ficam juntas no menu: duas abas, uma tela de cada. */
export function VagasTabs() {
  const { membership } = useOrganization()
  const canWait = usePermission('member_cycles.read', 'group')
  const base = `/${membership?.slug}`
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-4 py-1.5 font-semibold', isActive ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')
  if (!canWait) return null
  return (
    <div className="flex gap-2" role="tablist">
      <NavLink to={`${base}/vagas`} className={tab} role="tab">Vagas</NavLink>
      <NavLink to={`${base}/lista-de-espera`} className={tab} role="tab">Lista de espera</NavLink>
    </div>
  )
}
