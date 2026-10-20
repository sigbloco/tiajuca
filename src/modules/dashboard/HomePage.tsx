import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Card, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCurrency, formatDate, formatDayLong, formatTime, todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { COLOR_BADGE, listActivities } from '@/modules/events/service'

const ROLE_LABEL: Record<string, string> = { titular: 'Titular do bloco', direcao: 'Direção', professor: 'Professor', monitor: 'Monitor', integrante: 'Integrante' }

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-display text-xl font-bold', tone)}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function UpcomingEvents({ orgId, slug, tz }: { orgId: string; slug: string; tz: string }) {
  const today = todayIso(tz)
  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, 'upcoming', today],
    queryFn: async () => (await listActivities({ orgId, from: today, to: addDaysIso(today, 60) })).filter((a) => a.status !== 'cancelled').slice(0, 5),
  })
  const next = data?.find((a) => a.activity_types?.name === 'Ensaio')
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h3>Próximos eventos</h3>
        <Link className="text-primary hover:underline" to={`/${slug}/eventos`}>Ver agenda</Link>
      </div>
      {next && <p className="rounded-lg bg-primary/10 p-2 text-primary">Próximo ensaio: <strong className="capitalize">{formatDayLong(next.activity_date)}</strong>{next.start_time ? ` às ${formatTime(next.start_time)}` : ''}</p>}
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

/** Situação pessoal: ciclo atual, status, frequência e mensalidade (qualquer integrante). */
function MyStatus({ orgId, memberId, slug }: { orgId: string; memberId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ['my-status', orgId, memberId],
    queryFn: async () => {
      const cycle = (await supabase.from('cycles').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('is_current', { ascending: false }).order('starts_on', { ascending: false }).limit(1).maybeSingle()).data
      const mc = cycle ? (await supabase.from('member_cycles').select('member_cycle_statuses(name)').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()).data as { member_cycle_statuses: { name: string } | null } | null : null
      const att = cycle ? (await supabase.from('v_attendance_member_cycle').select('pct_present, records').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()).data : null
      const charge = (await supabase.from('monthly_charges').select('competence, final_amount, status, due_on').eq('member_id', memberId).in('status', ['pending']).order('competence').limit(1).maybeSingle()).data
      return { cycle, status: mc?.member_cycle_statuses?.name ?? null, att, charge }
    },
  })
  if (!data) return <Skeleton className="h-24" />
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat label="Ciclo atual" value={data.cycle?.name ?? '—'} />
      <Stat label="Meu status" value={data.status ?? 'Sem registro'} />
      <Stat label="Minha frequência" value={data.att ? `${Number(data.att.pct_present).toLocaleString('pt-BR')}%` : '—'} hint={data.att ? `${data.att.records} registros` : 'sem chamadas ainda'} />
      <Link to={`/${slug}/mensalidades`}>
        <Stat label="Mensalidade" value={data.charge ? formatCurrency(Number(data.charge.final_amount)) : 'Em dia'}
          hint={data.charge ? `vence ${formatDate(data.charge.due_on)}` : undefined} tone={data.charge && data.charge.due_on < todayIso() ? 'text-destructive' : undefined} />
      </Link>
    </div>
  )
}

/** Professor/Monitor: seu grupo (RLS já limita às pessoas acompanhadas). */
function GroupCard({ orgId, slug }: { orgId: string; slug: string }) {
  const today = todayIso()
  const { data } = useQuery({
    queryKey: ['group-summary', orgId, today],
    queryFn: async () => {
      const total = (await supabase.from('members').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('archived_at', null)).count ?? 0
      const rep = await supabase.rpc('attendance_report', { p_org: orgId, p_from: addDaysIso(today, -60), p_to: today, p_group: 'member' })
      const low = ((rep.data ?? []) as { label: string; pct: number }[]).sort((a, b) => Number(a.pct) - Number(b.pct)).slice(0, 5)
      return { total, low }
    },
  })
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between"><h3>Meu grupo</h3><Link className="text-primary hover:underline" to={`/${slug}/relatorios`}>Ver relatórios</Link></div>
      <p className="text-muted-foreground">{data ? `${data.total} integrante(s) acompanhados (incluindo você)` : '…'}</p>
      {data?.low.length ? (
        <>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Menor presença nos últimos 60 dias</p>
          {data.low.map((r) => <div key={r.label} className="flex justify-between"><span>{r.label}</span><strong>{Number(r.pct).toLocaleString('pt-BR')}%</strong></div>)}
        </>
      ) : <p className="text-muted-foreground">Sem registros de presença recentes.</p>}
    </Card>
  )
}

interface DirectionData {
  cycle: { name: string } | null
  members_total: number; members_active: number; members_inactive: number; members_waitlist: number
  by_classification: { name: string; count: number }[]
  by_section: { name: string; active: number }[]
  capacity: { limited: number; full: number; capacity: number; occupied: number }
  billing: { previsto: number; recebido: number; pendente: number; inadimplentes: number; bolsas: number }
  scholarships: { bolsistas: number; equivalente: number }
  finance: { despesas: number; receitas: number; saldo: number }
}

/** Direção: visão completa. Nenhum dado pessoal sensível (LGPD) entra aqui. */
function DirectionDashboard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-direction', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_direction', { p_org: orgId })
      if (error) throw error
      return data as DirectionData
    },
  })
  if (isLoading || !data) return <Skeleton className="h-40" />
  const maxSection = Math.max(1, ...data.by_section.map((s) => s.active))
  return (
    <div className="space-y-3">
      <h2>Visão da Direção {data.cycle && <span className="text-base font-normal text-muted-foreground">· {data.cycle.name}</span>}</h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Integrantes" value={data.members_total} />
        <Stat label="Ativos no ciclo" value={data.members_active} tone="text-success" />
        <Stat label="Inativos" value={data.members_inactive} />
        <Stat label="Lista de espera" value={data.members_waitlist} />
      </div>
      <Card className="space-y-2 p-4">
        <h3>Perfil do bloco</h3>
        <div className="flex flex-wrap gap-2">{data.by_classification.map((c) => <Badge key={c.name}>{c.name}: {c.count}</Badge>)}</div>
        <p className="pt-1 text-xs font-semibold uppercase text-muted-foreground">Ativos por naipe</p>
        {data.by_section.map((s) => (
          <div key={s.name} className="space-y-0.5">
            <div className="flex justify-between"><span>{s.name}</span><strong>{s.active}</strong></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(s.active / maxSection) * 100}%` }} /></div>
          </div>
        ))}
        <p className="pt-1 text-muted-foreground">Vagas: {data.capacity.occupied}/{data.capacity.capacity} ocupadas em {data.capacity.limited} instrumentos com limite · <strong>{data.capacity.full} lotado(s)</strong></p>
      </Card>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Arrecadado no mês" value={formatCurrency(Number(data.billing.recebido))} hint={`previsto ${formatCurrency(Number(data.billing.previsto))}`} tone="text-success" />
        <Stat label="Pendente" value={formatCurrency(Number(data.billing.pendente))} hint={`${data.billing.inadimplentes} inadimplente(s)`} tone={data.billing.inadimplentes ? 'text-destructive' : undefined} />
        <Stat label="Bolsas" value={`${data.scholarships.bolsistas} pessoas`} hint={`≈ ${Number(data.scholarships.equivalente).toLocaleString('pt-BR')} bolsa(s) integral(is)`} />
        <Stat label="Saldo do mês" value={formatCurrency(Number(data.finance.saldo))} hint={`despesas ${formatCurrency(Number(data.finance.despesas))}`} tone={Number(data.finance.saldo) < 0 ? 'text-destructive' : 'text-success'} />
      </div>
    </div>
  )
}

export function HomePage() {
  const { membership } = useOrganization()
  const isDirection = usePermission('finance.read')
  const isStaff = usePermission('attendance.read', 'group')
  if (!membership) return null
  return (
    <div className="space-y-4">
      <div>
        <h1>Olá, {membership.display_name.trim().split(/s+/)[0]}!</h1>
        <p className="text-muted-foreground">{membership.roles.length ? membership.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ') : 'Sem papel de acesso atribuído.'} em {membership.name}</p>
      </div>
      <MyStatus orgId={membership.organization_id} memberId={membership.member_id} slug={membership.slug} />
      <UpcomingEvents orgId={membership.organization_id} slug={membership.slug} tz={membership.timezone} />
      {isStaff && !isDirection && <GroupCard orgId={membership.organization_id} slug={membership.slug} />}
      {isDirection && <DirectionDashboard orgId={membership.organization_id} />}
    </div>
  )
}
