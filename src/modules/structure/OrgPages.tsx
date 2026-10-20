import { usePermission } from '@/core/permissions'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { CatalogEditor } from './CatalogEditor'

export function ChecklistsPage() {
  const canEvents = usePermission('events.manage')
  return <TemplatesSettings canEdit={canEvents} />
}

export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  return <CatalogEditor table="artistic_functions" title="Funções" singular="Função" hint="Papéis que não são instrumentos (ex.: Produção, Apoio). Aparecem em ordem alfabética." canEdit={canEdit} alphabetical />
}

export function SectionNamesPage() {
  const canEdit = usePermission('structure.manage')
  return <CatalogEditor table="section_names" title="Nomes de naipes" singular="Nome" hint="Nomes que o formulário “Novo naipe” oferece. Para criar o naipe em si, use Naipes → Novo naipe." canEdit={canEdit} />
}
