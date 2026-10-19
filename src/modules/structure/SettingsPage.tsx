import { useState } from 'react'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { ContributionsEditor } from '@/modules/billing/ContributionsEditor'
import { HolidaysSettings } from '@/modules/billing/BillingSettings'
import { IntegrationsSettings } from '@/modules/integrations/IntegrationsSettings'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { SiteSettings } from '@/modules/site/SiteSettings'
import { CatalogEditor } from './CatalogEditor'
import { StaffAssignments } from './StaffAssignments'
import { InstrumentsManager, SectionsManager } from './StructureManagers'

const TABS = [
  { key: 'sections', label: 'Naipes' },
  { key: 'instruments', label: 'Instrumentos' },
  { key: 'functions', label: 'Funções' },
  { key: 'staff', label: 'Equipe' },
  { key: 'types', label: 'Tipos de evento' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'fees', label: 'Contribuições' },
  { key: 'holidays', label: 'Feriados' },
  { key: 'integrations', label: 'Drive (partituras)' },
  { key: 'site', label: 'Site' },
] as const

export function SettingsPage() {
  const canEdit = usePermission('structure.manage')
  const canEvents = usePermission('events.manage')
  const canBilling = usePermission('billing.manage')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('sections')
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
      {tab === 'sections' && <SectionsManager canEdit={canEdit} />}
      {tab === 'instruments' && <InstrumentsManager canEdit={canEdit} />}
      {tab === 'functions' && <CatalogEditor table="artistic_functions" title="Funções" singular="Função" hint="Papéis que não são instrumentos (ex.: Produção, Apoio)." canEdit={canEdit} />}
      {tab === 'staff' && <StaffAssignments />}
      {tab === 'types' && <CatalogEditor table="activity_types" title="Tipos de evento" singular="Tipo" withColor canEdit={canEvents} hint="Cada tipo tem uma cor no calendário." />}
      {tab === 'checklists' && <TemplatesSettings canEdit={canEvents} />}
      {tab === 'fees' && <ContributionsEditor canEdit={canBilling} />}
      {tab === 'holidays' && <HolidaysSettings />}
      {tab === 'integrations' && <IntegrationsSettings />}
      {tab === 'site' && <SiteSettings />}
    </div>
  )
}
