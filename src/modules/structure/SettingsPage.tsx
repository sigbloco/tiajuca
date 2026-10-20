import { useState } from 'react'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { IntegrationsSettings } from '@/modules/integrations/IntegrationsSettings'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { CatalogEditor } from './CatalogEditor'

const TABS = [
  { key: 'functions', label: 'Funções' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'integrations', label: 'Google Drive' },
] as const

/** Configurações gerais. Naipes, instrumentos e equipe ficam em Organização > Naipes; contribuições em Financeiro; tipos de evento e feriados em Calendário. */
export function SettingsPage() {
  const canEdit = usePermission('structure.manage')
  const canEvents = usePermission('events.manage')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('functions')
  return (
    <div className="space-y-4">
      <h1>Configurações</h1>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'bg-primary text-primary-foreground hover:bg-primary')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'functions' && <CatalogEditor table="artistic_functions" title="Funções" singular="Função" hint="Papéis que não são instrumentos (ex.: Produção, Apoio). Aparecem em ordem alfabética." canEdit={canEdit} alphabetical />}
      {tab === 'checklists' && <TemplatesSettings canEdit={canEvents} />}
      {tab === 'integrations' && <IntegrationsSettings />}
    </div>
  )
}
