import { useState } from 'react'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { CatalogEditor } from './CatalogEditor'
import { StaffAssignments } from './StaffAssignments'

const TABS = [
  { key: 'areas', label: 'Áreas' },
  { key: 'sections', label: 'Naipes' },
  { key: 'instruments', label: 'Instrumentos' },
  { key: 'functions', label: 'Funções' },
  { key: 'levels', label: 'Níveis' },
  { key: 'staff', label: 'Equipe' },
] as const

export function SettingsPage() {
  const canEdit = usePermission('structure.manage')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('areas')
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
      {tab === 'areas' && <CatalogEditor table="areas" title="Áreas" singular="Área" canEdit={canEdit} />}
      {tab === 'sections' && <CatalogEditor table="sections" title="Naipes" singular="Naipe" withArea canEdit={canEdit} />}
      {tab === 'instruments' && <CatalogEditor table="instruments" title="Instrumentos" singular="Instrumento" withArea withSection canEdit={canEdit} />}
      {tab === 'functions' && <CatalogEditor table="artistic_functions" title="Funções" singular="Função" canEdit={canEdit} />}
      {tab === 'levels' && <CatalogEditor table="skill_levels" title="Níveis" singular="Nível" canEdit={canEdit} />}
      {tab === 'staff' && <StaffAssignments />}
    </div>
  )
}
