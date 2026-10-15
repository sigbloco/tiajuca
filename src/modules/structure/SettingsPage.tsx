import { useState } from 'react'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { CatalogEditor } from './CatalogEditor'
import { StaffAssignments } from './StaffAssignments'

const TABS = [
  { key: 'sections', label: 'Naipes' },
  { key: 'subsections', label: 'Subnaipes' },
  { key: 'instruments', label: 'Instrumentos' },
  { key: 'functions', label: 'Funções' },
  { key: 'levels', label: 'Níveis' },
  { key: 'staff', label: 'Equipe' },
] as const

export function SettingsPage() {
  const canEdit = usePermission('structure.manage')
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
      {tab === 'sections' && <CatalogEditor table="sections" title="Naipes" singular="Naipe" hint="Grandes grupos, como Percussão, Sopro e Performance." canEdit={canEdit} />}
      {tab === 'subsections' && (
        <CatalogEditor table="subsections" title="Subnaipes" singular="Subnaipe" withSection canEdit={canEdit}
          hint="Agrupamentos internos dentro de um naipe (ex.: Metais, Leves). Só a equipe enxerga; alunos e integrantes não." />
      )}
      {tab === 'instruments' && (
        <CatalogEditor table="instruments" title="Instrumentos" singular="Instrumento" withSection withSubsection canEdit={canEdit}
          hint="Cada instrumento fica dentro de um naipe e, opcionalmente, de um subnaipe. Vagas e acompanhamento valem por instrumento." />
      )}
      {tab === 'functions' && <CatalogEditor table="artistic_functions" title="Funções" singular="Função" hint="Papéis que não são instrumentos (ex.: Produção, Apoio)." canEdit={canEdit} />}
      {tab === 'levels' && <CatalogEditor table="skill_levels" title="Níveis" singular="Nível" canEdit={canEdit} />}
      {tab === 'staff' && <StaffAssignments />}
    </div>
  )
}
