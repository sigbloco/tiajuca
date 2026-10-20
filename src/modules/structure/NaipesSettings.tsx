import { NavLink } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { CatalogEditor } from './CatalogEditor'

const PAGES = [
  { to: 'nomes', title: 'Nomes de naipes', text: 'Os nomes que “Novo naipe” oferece (Sopro, Cordas, Percussão…).' },
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

