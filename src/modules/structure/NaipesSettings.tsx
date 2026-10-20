import { usePermission } from '@/core/permissions'
import { CatalogEditor } from './CatalogEditor'

/** Naipes → Configurações: abre direto nos nomes de naipes (o que “Novo naipe” oferece). */
export function SectionNamesPage() {
  const canEdit = usePermission('structure.manage')
  return <CatalogEditor table="section_names" title="Nomes de naipes" singular="Nome" hint="Nomes que o formulário “Novo naipe” oferece. Para criar o naipe em si, use Naipes → Novo naipe." canEdit={canEdit} />
}
