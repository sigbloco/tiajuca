import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EMPTY_FILTER, FilterBar, type FilterValue } from '@/components/shared/FilterBar'
import { DateInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

const PAGE = 25
const ENTITY_LABEL: Record<string, string> = {
  members: 'Cadastro de integrante', member_sensitive_data: 'Dados sensíveis', member_access_roles: 'Papel de acesso', role_permissions: 'Permissões do papel',
  classifications: 'Classificação', member_classifications: 'Classificação do integrante', organizations: 'Organização', org_settings: 'Configuração',
  sections: 'Naipe', subsections: 'Subnaipe', instruments: 'Instrumento', artistic_functions: 'Função', skill_levels: 'Nível', member_artistic_links: 'Vínculo artístico',
  cycles: 'Ciclo', cycle_types: 'Tipo de ciclo', member_cycles: 'Status no ciclo', member_cycle_statuses: 'Status de ciclo', instrument_cycle_capacity: 'Limite de vagas',
  staff_assignments: 'Atribuição da equipe', activities: 'Evento', activity_types: 'Tipo de evento', recurrence_rules: 'Recorrência', activity_audiences: 'Público do evento',
  event_attendance: 'Presença', attendance_statuses: 'Status de presença', activity_checklist_items: 'Checklist do evento', checklist_templates: 'Modelo de checklist',
  checklist_template_items: 'Item de modelo', fee_categories: 'Categoria de contribuição', fee_category_prices: 'Valor da categoria', member_fee_assignments: 'Categoria do integrante',
  scholarships: 'Bolsa', scholarship_types: 'Tipo de bolsa', monthly_charges: 'Mensalidade', charge_adjustments: 'Ajuste de mensalidade', financial_entries: 'Lançamento financeiro',
  finance_categories: 'Categoria financeira', distribution_destinations: 'Destino de distribuição', distribution_rules: 'Regra de distribuição', member_pix_keys: 'Chave PIX',
  staff_payments: 'Pagamento da equipe', repertoires: 'Repertório', songs: 'Música', song_attachments: 'Anexo de música', integrations: 'Integração',
}
const ACTION_LABEL: Record<string, string> = {
  insert: 'Criado', update: 'Alterado', delete: 'Removido', invite_created: 'Convite criado', invite_claimed: 'Convite aceito', sensitive_read: 'Leitura de dado sensível',
}
const SKIP = new Set(['updated_at', 'created_at', 'updated_by', 'created_by'])

interface Log {
  id: number; actor_member_id: string | null; action: string; entity_type: string; entity_id: string | null
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string
}

function Diff({ log }: { log: Log }) {
  const o = log.old_data ?? {}
  const n = log.new_data ?? {}
  const keys = Object.keys({ ...o, ...n }).filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
  if (log.new_data && 'changed_fields' in log.new_data) return <p className="text-muted-foreground">Campos alterados: {(log.new_data.changed_fields as string[]).join(', ') || '—'} (valores não são registrados por serem sensíveis).</p>
  if (keys.length === 0) return <p className="text-muted-foreground">Sem detalhes de campos.</p>
  const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <ul className="space-y-1 text-xs">
      {keys.slice(0, 12).map((k) => (
        <li key={k}><span className="font-semibold">{k}</span>: {log.action === 'update' && <><span className="text-muted-foreground line-through">{show(o[k])}</span> → </>}<span>{show(n[k])}</span></li>
      ))}
    </ul>
  )
}

/** Auditoria (somente Direção): quem fez o quê e quando, com filtros e paginação no banco. */
export function AuditLogTab() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => setPage(0), [entity, action, from, to])

  const logs = useQuery({
    queryKey: ['audit', orgId, entity, action, from, to, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('id, actor_member_id, action, entity_type, entity_id, old_data, new_data, created_at', { count: 'exact' })
        .eq('organization_id', orgId).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (entity) q = q.eq('entity_type', entity)
      if (action) q = q.eq('action', action)
      if (from) q = q.gte('created_at', `${from}T00:00:00-03:00`)
      if (to) q = q.lte('created_at', `${to}T23:59:59-03:00`)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: (data ?? []) as Log[], total: count ?? 0 }
    },
  })
  const actorIds = [...new Set((logs.data?.rows ?? []).map((r) => r.actor_member_id).filter(Boolean))] as string[]
  const actors = useQuery({
    queryKey: ['audit-actors', actorIds.join(',')],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name').in('id', actorIds)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((m) => [m.id as string, (shortName(m?.full_name, m?.display_name)) as string]))
    },
  })

  const total = logs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  return (
    <div className="space-y-4">
      <h2>Registro de alterações</h2>
      <FilterBar value={filter} onChange={setFilter} extraCount={(entity ? 1 : 0) + (action ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0)}
        onClearExtra={() => { setEntity(''); setAction(''); setFrom(''); setTo('') }}>
        <Select aria-label="Tipo de registro" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Todos os registros</option>
          {Object.entries(ENTITY_LABEL).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Ação" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todas as ações</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <DateInput aria-label="De" value={from} onChange={setFrom} />
        <DateInput aria-label="Até" value={to} onChange={setTo} />
      </FilterBar>

      {logs.isError && <Card className="p-3 text-destructive">{friendlyError(logs.error)}</Card>}
      {logs.isLoading && <Skeleton className="h-32" />}
      {logs.data && logs.data.rows.length === 0 && <EmptyState>Nenhum registro encontrado.</EmptyState>}
      <div className="grid gap-2">
        {logs.data?.rows.filter((r) => !filter.search.trim() || `${ENTITY_LABEL[r.entity_type] ?? r.entity_type} ${actors.data?.[r.actor_member_id ?? ''] ?? ''}`.toLowerCase().includes(filter.search.trim().toLowerCase())).map((r) => (
          <Card key={r.id} className="p-3">
            <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <div className="min-w-0">
                <p className="truncate font-semibold">{ENTITY_LABEL[r.entity_type] ?? r.entity_type}</p>
                <p className="truncate text-muted-foreground">{actors.data?.[r.actor_member_id ?? ''] ?? (r.actor_member_id ? '…' : 'Sistema')} · {formatDateTime(r.created_at, membership?.timezone)}</p>
              </div>
              <Badge className={r.action === 'sensitive_read' ? 'bg-warning/15 text-warning' : ''}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
            </button>
            {open === r.id && <div className="mt-2 border-t border-border pt-2"><Diff log={r} /></div>}
          </Card>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{total} registro(s)</p>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page + 1} / {pages}</span>
          <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
