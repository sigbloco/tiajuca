import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { addDaysIso, formatCurrency, formatDate, formatDayLong, todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { EventCard } from '@/modules/events/EventCard'
import { EventSheet } from '@/modules/events/EventSheet'
import { listActivities, type Activity } from '@/modules/events/service'

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

const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/s$/, '')

/** Naipes da pessoa no ciclo (equipe ou aluno/participante): usados para esconder a oficina dos outros naipes. */
function useMySections(orgId: string, memberId: string, cycleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['my-sections', orgId, memberId, cycleId],
    enabled: enabled && Boolean(cycleId),
    queryFn: async () => {
      const [secs, inst, staff, parts] = await Promise.all([
        supabase.from('sections').select('id, name').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('instruments').select('id, section_id').eq('organization_id', orgId).limit(1000),
        supabase.from('staff_assignments').select('section_id, instrument_id').eq('organization_id', orgId).eq('member_id', memberId).eq('cycle_id', cycleId!).is('valid_to', null).in('staff_kind', ['professor', 'monitor']),
        supabase.from('cycle_participations').select('instrument_id').eq('member_id', memberId).eq('cycle_id', cycleId!).not('instrument_id', 'is', null),
      ])
      const insMap = new Map((inst.data ?? []).map((x) => [x.id as string, x.section_id as string]))
      const ids = new Set<string>()
      for (const r of staff.data ?? []) {
        const sid = r.section_id ?? (r.instrument_id ? insMap.get(r.instrument_id) : undefined)
        if (sid) ids.add(sid as string)
      }
      for (const r of parts.data ?? []) { const sid = insMap.get(r.instrument_id as string); if (sid) ids.add(sid) }
      const all = (secs.data ?? []).map((x) => ({ id: x.id as string, plain: plain(x.name as string) }))
      return { mine: new Set(all.filter((x) => ids.has(x.id)).map((x) => x.plain)), all: all.map((x) => x.plain) }
    },
  })
}

function UpcomingEvents({ orgId, memberId, slug, tz, filterByMine }: { orgId: string; memberId: string; slug: string; tz: string; filterByMine: boolean }) {
  const today = todayIso(tz)
  const { cycleId } = useSelectedCycle()
  const [shown, setShown] = useState(3)
  const [sheet, setSheet] = useState<{ activity: Activity; edit?: boolean } | null>(null)
  const my = useMySections(orgId, memberId, cycleId, filterByMine)
  const { data, isLoading } = useQuery({
    queryKey: ['activities', orgId, 'upcoming', today],
    queryFn: async () => (await listActivities({ orgId, from: today, to: addDaysIso(today, 90) })).filter((a) => a.status !== 'cancelled'),
  })
  // Oficina de outro naipe não aparece (vale para professor, monitor e aluno). Sem naipe no título, aparece para todos.
  const visible = (data ?? []).filter((a) => {
    if (!filterByMine || !my.data || my.data.mine.size === 0) return true
    const t = plain(a.title)
    const hits = my.data.all.filter((n) => t.includes(n))
    return hits.length === 0 || hits.some((n) => my.data!.mine.has(n))
  })
  const todayCount = visible.filter((a) => a.activity_date === today).length
  const list = visible.slice(0, todayCount + shown)
  const days = [...new Set(list.map((a) => a.activity_date))]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3>Próximos eventos</h3><Link className="text-primary hover:underline" to={`/${slug}/eventos`}>Ver agenda</Link></div>
      {(isLoading || (filterByMine && my.isLoading)) && <Skeleton className="h-16" />}
      {data && visible.length === 0 && <p className="text-muted-foreground">Nenhum evento agendado.</p>}
      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h4 className="capitalize">{day === today ? 'Hoje · ' : ''}{formatDayLong(day)}</h4>
          {list.filter((a) => a.activity_date === day).map((a, i) => <EventCard key={a.id} a={a} index={i} onOpen={() => setSheet({ activity: a })} onEdit={() => setSheet({ activity: a, edit: true })} />)}
        </section>
      ))}
      {visible.length > list.length && <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + 3)}>Carregar mais...</Button>}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <EventSheet key={sheet.activity.id} startEditing={sheet.edit} activity={sheet.activity} defaultDate={today} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}

/** Situação pessoal: ciclo atual, status, frequência e mensalidade (qualquer integrante). */
function MyStatus({ orgId, memberId, slug, staff }: { orgId: string; memberId: string; slug: string; staff: boolean }) {
  const { cycle: sel } = useSelectedCycle()
  const { data } = useQuery({
    queryKey: ['my-status', orgId, memberId, sel?.id],
    enabled: Boolean(sel),
    queryFn: async () => {
      const cycle = sel ? { id: sel.id, name: sel.name } : null
      const mc = cycle ? (await supabase.from('member_cycles').select('member_cycle_statuses(name)').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()).data as { member_cycle_statuses: { name: string } | null } | null : null
      const att = cycle ? (await supabase.from('v_attendance_member_cycle').select('pct_present, records').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()).data : null
      const charge = (await supabase.from('monthly_charges').select('competence, final_amount, status, due_on').eq('member_id', memberId).in('status', ['pending']).order('competence').limit(1).maybeSingle()).data
      const sch = cycle ? (await supabase.from('cycle_scholarships').select('percent').eq('member_id', memberId).eq('cycle_id', cycle.id).maybeSingle()).data as { percent: number } | null : null
      return { cycle, status: mc?.member_cycle_statuses?.name ?? null, att, charge, exempt: Number(sch?.percent ?? 0) >= 100 }
    },
  })
  if (!data) return <Skeleton className="h-24" />
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat label="Ciclo" value={data.cycle?.name ?? '—'} />
      <Stat label="Meu status" value={data.status ?? 'Sem registro'} />
      {!staff && <Stat label="Minha frequência" value={data.att ? `${Number(data.att.pct_present).toLocaleString('pt-BR')}%` : '—'} hint={data.att ? `${data.att.records} registros` : 'sem chamadas ainda'} />}
      {!staff && <Link to={`/${slug}/cobrancas`}>
        <Stat label="Mensalidade" value={data.exempt ? 'Isento' : data.charge ? formatCurrency(Number(data.charge.final_amount)) : 'Em dia'}
          hint={!data.exempt && data.charge ? `vence ${formatDate(data.charge.due_on)}` : undefined} tone={!data.exempt && data.charge && data.charge.due_on < todayIso() ? 'text-destructive' : undefined} />
      </Link>}
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
      <p className="text-muted-foreground">{data ? `${data.total} integrante(s) acompanhados (incluindo você)` : '—'}</p>
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
      <MyStatus orgId={membership.organization_id} memberId={membership.member_id} slug={membership.slug} staff={isStaff && !isDirection} />
      <UpcomingEvents orgId={membership.organization_id} memberId={membership.member_id} slug={membership.slug} tz={membership.timezone} filterByMine={!isDirection} />
      {isStaff && !isDirection && <GroupCard orgId={membership.organization_id} slug={membership.slug} />}
      {isDirection && <DirectionDashboard orgId={membership.organization_id} />}
    </div>
  )
}
