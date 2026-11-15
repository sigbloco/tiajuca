import { Card } from '@/components/ui/primitives'
import { PageLink } from '@/components/shared/PageLink'
import { usePermission } from '@/core/permissions'
import { CatalogEditor } from '@/modules/structure/CatalogEditor'

/** Inscrições → Configurações: as listas universais do cadastro, usadas por todos os formulários (cada formulário marca quais itens mostrar). */
export function FormListsPage() {
  const canEdit = usePermission('forms.manage')
  return (
    <div className="space-y-4">
      <div>
        <h1>Listas do cadastro</h1>
        <p className="text-muted-foreground">
          Definidas uma vez e usadas em todos os formulários. No editor de cada pergunta ligada ao cadastro, você marca quais itens aparecem.
          Instrumentos ficam em <PageLink to="naipes">Naipes e instrumentos</PageLink> e categorias em <PageLink to="funcoes">Organização → Categorias</PageLink>.
        </p>
      </div>
      <Card className="space-y-2 p-4">
        <CatalogEditor table="skill_levels" title="Níveis" singular="Nível" canEdit={canEdit}
          hint="O nível é uma autodeclaração: a pessoa diz que nível acredita ter (ex.: Iniciante, Intermediário, Avançado)." />
      </Card>
      <Card className="space-y-2 p-4">
        <CatalogEditor table="gender_options" title="Gênero" singular="Opção" canEdit={canEdit} hint="Dado sensível: fica restrito à Direção." />
      </Card>
      <Card className="space-y-2 p-4">
        <CatalogEditor table="race_options" title="Cor/raça" singular="Opção" canEdit={canEdit} hint="Dado sensível: fica restrito à Direção." />
      </Card>
    </div>
  )
}
