import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Card, Skeleton } from '@/components/ui/primitives'
import { addDaysIso, formatDayLong, formatTime, todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { COLOR_BADGE, listActivities } from '@/modules/events/service'

const ROLE_LABEL: Record<string, string> = { direcao: 'Direção', professor: 'Professor', monitor: 'Monitor', integrante: 'Integrante' }

function UpcomingEvents({ orgId, slug, tz }: { orgId: string; slug: string; tz: string }) {
  const today = todayIso(tz)
  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, 'upcoming', today],
    queryFn: async () => (await listActivities({ orgId, from: today, to: addDaysIso(today, 60) })).filter((a) => a.status !== 'cancelled').slice(0, 5),
  })
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h3>Próximos eventos</h3>
        <Link className="text-primary hover:underline" to={`/${slug}/eventos`}>Ver agenda</Link>
      </div>
      {isLoading && <Skeleton className="h-16" />}
      {data?.length === 0 && <p className="text-muted-foreground">Nenhum evento agendado.</p>}
      {data?.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{a.title}</p>
            <p className="capitalize text-muted-foreground">{formatDayLong(a.activity_date)}{a.start_time ? ` · ${formatTime(a.start_time)}` : ''}</p>
          </div>
          {a.activity_types && <Badge className={COLOR_BADGE[a.activity_types.color]}>{a.activity_types.name}</Badge>}
        </div>
      ))}
    </Card>
  )
}

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
      <UpcomingEvents orgId={membership.organization_id} slug={membership.slug} tz={membership.timezone} />
    </div>
  )
}
