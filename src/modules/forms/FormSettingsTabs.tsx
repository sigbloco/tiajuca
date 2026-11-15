import { LayoutTemplate, ListChecks } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { LabelFitRow } from '@/components/shared/LabelFitRow'
import { Button } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'

/** Páginas de Formulários → Configurações, como botões de alternância (a aberta fica marcada). */
export function FormSettingsTabs() {
  const { membership } = useOrganization()
  const { pathname } = useLocation()
  const base = `/${membership?.slug}/formularios/configuracoes`
  const tabs = [
    { to: base, label: 'Seções modelo', icon: LayoutTemplate },
    { to: `${base}/listas`, label: 'Listas do cadastro', icon: ListChecks },
  ]
  return (
    <LabelFitRow role="tablist" aria-label="Páginas de configurações dos formulários">
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
