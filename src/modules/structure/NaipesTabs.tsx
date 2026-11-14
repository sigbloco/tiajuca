import { Drum, Network, Settings, UserRoundCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { LabelFitRow } from '@/components/shared/LabelFitRow'
import { Button } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'

/** Páginas de Naipes e instrumentos, como botões de alternância: a que está aberta fica marcada e dá para ir de uma à outra. */
export function NaipesTabs() {
  const { membership } = useOrganization()
  const { pathname } = useLocation()
  const canEdit = usePermission('structure.manage')
  const canVagas = usePermission('capacity.read')
  const base = `/${membership?.slug}`
  const tabs = [
    { to: `${base}/naipes`, label: 'Naipes', icon: Drum, show: true },
    { to: `${base}/vagas`, label: 'Vagas', icon: UserRoundCheck, show: canVagas },
    { to: `${base}/naipes/organograma`, label: 'Organograma', icon: Network, show: true },
    { to: `${base}/naipes/configuracoes`, label: 'Configurações', icon: Settings, show: canEdit },
  ].filter((t) => t.show)
  return (
    <LabelFitRow role="tablist" aria-label="Páginas de naipes e instrumentos">
      {tabs.map((t) => {
        const on = pathname.replace(/\/$/, '') === t.to
        return (
          <Button key={t.to} asChild variant={on ? 'default' : 'outline'} aria-label={t.label} title={t.label}>
            <Link to={t.to} role="tab" aria-selected={on} aria-current={on ? 'page' : undefined}><t.icon className="h-4 w-4 shrink-0" /><span className="fit-label">{t.label}</span></Link>
          </Button>
        )
      })}
    </LabelFitRow>
  )
}
