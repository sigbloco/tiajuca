import { NavLink } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { CatalogEditor } from './CatalogEditor'

const PAGES = [
  { to: 'nomes', title: 'Nomes de naipes', text: 'Os nomes que “Novo naipe” oferece (Sopro, Cordas, Percussão…).' },
  { to: 'funcoes', title: 'Funções', text: 'Professor, Monitor e Regente (equipe) e outras funções, como Produção e Apoio.' },
]

/** Naipes → Configurações: cartões para as subpáginas. */
export function NaipesSettingsHome() {
  return (
    <div className="space-y-4">
      <div><h1>Configurações de naipes</h1><p className="text-muted-foreground">Ajustes que valem para todos os naipes.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PAGES.map((p) => (
          <NavLink key={p.to} to={p.to}>
            <Card className="h-full p-4 hover:bg-muted/50"><p className="font-display text-lg font-bold">{p.title}</p><p className="text-muted-foreground">{p.text}</p></Card>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export function SectionNamesPage() {
  const canEdit = usePermission('structure.manage')
  return <CatalogEditor table="section_names" title="Nomes de naipes" singular="Nome" hint="Nomes que o formulário “Novo naipe” oferece. Para criar o naipe em si, use Naipes → Novo naipe." canEdit={canEdit} />
}

export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  return (
    <div className="space-y-4">
      <Card className="space-y-1 p-4">
        <p className="font-semibold">Funções da equipe</p>
        <p className="text-muted-foreground">Professor, Monitor e Regente são designados em cada naipe, subnaipe e instrumento, pelos botões “+ Professor”, “+ Monitor” e “+ Regente”.</p>
      </Card>
      <CatalogEditor table="artistic_functions" title="Outras funções" singular="Função" hint="Papéis que não são instrumentos (ex.: Produção, Apoio). Aparecem em ordem alfabética." canEdit={canEdit} alphabetical />
    </div>
  )
}
