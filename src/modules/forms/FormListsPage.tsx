import { useState } from 'react'
import { Collapsible } from '@/components/shared/Collapsible'
import { PageLink } from '@/components/shared/PageLink'
import { usePermission } from '@/core/permissions'
import { FormSettingsTabs } from './FormSettingsTabs'
import { CatalogEditor, useCatalog } from '@/modules/structure/CatalogEditor'
import type { CatalogTable } from '@/modules/structure/service'

const LISTS: { table: CatalogTable; title: string; singular: string; hint: string }[] = [
  { table: 'skill_levels', title: 'Níveis', singular: 'Nível', hint: 'O nível é uma autodeclaração: a pessoa diz que nível acredita ter (ex.: Iniciante, Intermediário, Avançado).' },
  { table: 'gender_options', title: 'Gênero', singular: 'Opção', hint: 'Dado sensível: fica restrito à Direção.' },
  { table: 'race_options', title: 'Cor/raça', singular: 'Opção', hint: 'Dado sensível: fica restrito à Direção.' },
]

function ListGroup({ table, title, singular, hint, open, onToggle, canEdit }: (typeof LISTS)[number] & { open: boolean; onToggle: () => void; canEdit: boolean }) {
  const items = useCatalog(table)
  return (
    <Collapsible open={open} onToggle={onToggle} title={title} count={items.data?.filter((i) => i.is_active).length}>
      <CatalogEditor table={table} title="" singular={singular} canEdit={canEdit} hint={hint} noFilter />
    </Collapsible>
  )
}

/** Formulários → Configurações: as listas universais do cadastro, usadas por todos os formulários (cada formulário marca quais itens mostrar). */
export function FormListsPage() {
  const canEdit = usePermission('forms.manage')
  const [opened, setOpened] = useState<Set<string>>(new Set()) // começam todas recolhidas
  const toggle = (t: string) => setOpened((cur) => { const n = new Set(cur); if (n.has(t)) n.delete(t); else n.add(t); return n })
  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <div>
        <p className="text-muted-foreground">
          Definidas uma vez e usadas em todos os formulários. No editor de cada pergunta ligada ao cadastro, você marca quais itens aparecem.
          Instrumentos ficam em <PageLink to="naipes">Naipes e instrumentos</PageLink> e categorias em <PageLink to="funcoes">Organização → Categorias</PageLink>.
        </p>
      </div>
      <div className="space-y-2">
        {LISTS.map((l) => <ListGroup key={l.table} {...l} open={opened.has(l.table)} onToggle={() => toggle(l.table)} canEdit={canEdit} />)}
      </div>
    </div>
  )
}
