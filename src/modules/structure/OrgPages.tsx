import { usePermission } from '@/core/permissions'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { CatalogEditor } from './CatalogEditor'

export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  return (
    <CatalogEditor table="artistic_functions" title="Funções" singular="Função" canEdit={canEdit} alphabetical noFilter mirrorFees
      hint="Papéis que não são instrumentos (Produção, Apoio…), em ordem alfabética. Cada função criada aqui também vira uma categoria em Contribuições (Financeiro). Professor, Monitor e Regente são designados em Naipes." />
  )
}

export function ChecklistsPage() {
  const canEvents = usePermission('events.manage')
  return <TemplatesSettings canEdit={canEvents} />
}
