import { Card } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'

const ROLE_LABEL: Record<string, string> = { direcao: 'Direção', professor: 'Professor', monitor: 'Monitor', integrante: 'Integrante' }

export function HomePage() {
  const { membership } = useOrganization()
  if (!membership) return null
  return (
    <div className="space-y-4">
      <h1>Olá, {membership.display_name}!</h1>
      <Card className="p-4">
        <p className="font-semibold">Seu acesso em {membership.name}</p>
        <p className="text-muted-foreground">
          {membership.roles.length ? membership.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ') : 'Sem papel de acesso atribuído.'}
        </p>
      </Card>
      <Card className="p-4 text-muted-foreground">
        Próximos eventos, frequência e mensalidade aparecerão aqui nas próximas fases.
      </Card>
    </div>
  )
}
