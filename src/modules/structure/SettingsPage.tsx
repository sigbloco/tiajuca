import { useState } from 'react'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { ContributionsSettings, HolidaysSettings } from '@/modules/billing/BillingSettings'
import { RecurrencesSettings } from '@/modules/events/RecurrencesSettings'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { CatalogEditor } from './CatalogEditor'
import { StaffAssignments } from './StaffAssignments'
import { InstrumentsManager, SectionsManager } from './StructureManagers'

const TABS = [
  { key: 'sections', label: 'Naipes' },
  { key: 'instruments', label: 'Instrumentos' },
  { key: 'functions', label: 'Funções' },
  { key: 'levels', label: 'Níveis' },
  { key: 'staff', label: 'Equipe' },
  { key: 'types', label: 'Tipos de evento' },
  { key: 'recurrences', label: 'Recorrências' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'fees', label: 'Contribuições' },
  { key: 'holidays', label: 'Feriados' },
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
      {tab === 'levels' && <CatalogEditor table="skill_levels" title="Níveis" singular="Nível" canEdit={canEdit} />}
      {tab === 'staff' && <StaffAssignments />}
      {tab === 'types' && <CatalogEditor table="activity_types" title="Tipos de evento" singular="Tipo" withColor canEdit={canEvents} hint="Cada tipo tem uma cor no calendário." />}
      {tab === 'recurrences' && <RecurrencesSettings />}
      {tab === 'checklists' && <TemplatesSettings canEdit={canEvents} />}
      {tab === 'fees' && <ContributionsSettings canEdit={canBilling} />}
      {tab === 'holidays' && <HolidaysSettings />}
    </div>
  )
}
