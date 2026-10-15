import { supabase } from '@/core/supabase'
import { formatCompetence, formatCurrency, formatDate } from '@/core/format'

export type ChargeStatus = 'pending' | 'paid' | 'exempt' | 'cancelled'
export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = { pending: 'Pendente', paid: 'Pago', exempt: 'Isento', cancelled: 'Cancelado' }
export const CHARGE_STATUS_CLASS: Record<ChargeStatus, string> = {
  pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success', exempt: 'bg-info/15 text-info', cancelled: 'bg-muted text-muted-foreground',
}

export interface Charge {
  id: string
  member_id: string
  competence: string
  base_amount: number
  scholarship_percent: number
  scholarship_discount: number
  final_amount: number
  status: ChargeStatus
  due_on: string
  paid_on: string | null
  payment_method: string | null
  manual_adjustment: boolean
  notes: string | null
  members: { full_name: string; display_name: string | null } | null
  fee_categories: { name: string } | null
}

const SELECT =
  'id, member_id, competence, base_amount, scholarship_percent, scholarship_discount, final_amount, status, due_on, paid_on, payment_method, manual_adjustment, notes, members!inner(full_name, display_name), fee_categories(name)'

export async function listCharges(p: {
  orgId: string; competence: string; status: ChargeStatus | ''; search: string; page: number; pageSize: number
}) {
  let q = supabase.from('monthly_charges').select(SELECT, { count: 'exact' })
    .eq('organization_id', p.orgId).eq('competence', p.competence)
    .order('full_name', { referencedTable: 'members', ascending: true })
    .range(p.page * p.pageSize, p.page * p.pageSize + p.pageSize - 1)
  if (p.status) q = q.eq('status', p.status)
  const term = p.search.replace(/[%*,()]/g, ' ').trim()
  if (term) q = q.ilike('members.full_name', `%${term}%`)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as unknown as Charge[], total: count ?? 0 }
}

export async function listMyCharges(memberId: string) {
  const { data, error } = await supabase.from('monthly_charges').select(SELECT)
    .eq('member_id', memberId).order('competence', { ascending: false }).limit(24)
  if (error) throw error
  return (data ?? []) as unknown as Charge[]
}

export interface Summary {
  previsto: number; recebido: number; pendente: number; isento: number; impacto_bolsas: number; inadimplentes: number; cobrancas: number
}
export async function getSummary(orgId: string, competence: string): Promise<Summary> {
  const { data, error } = await supabase.from('v_billing_summary').select('*').eq('organization_id', orgId).eq('competence', competence).maybeSingle()
  if (error) throw error
  const z = (v: unknown) => Number(v ?? 0)
  return {
    previsto: z(data?.previsto), recebido: z(data?.recebido), pendente: z(data?.pendente), isento: z(data?.isento),
    impacto_bolsas: z(data?.impacto_bolsas), inadimplentes: z(data?.inadimplentes), cobrancas: z(data?.cobrancas),
  }
}

export async function generateCharges(orgId: string, competence: string) {
  const { data, error } = await supabase.rpc('generate_monthly_charges', { p_org: orgId, p_competence: competence })
  if (error) throw error
  return data as { created: number; already_existing: number; skipped_no_price: number }
}

/** Competência (dia 1) a partir de ano/mês(0-11). */
export const competenceOf = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, '0')}-01`

/** Texto de inadimplentes pronto para colar no WhatsApp. */
export async function overdueWhatsapp(orgId: string, competence: string, today: string): Promise<string> {
  const { data, error } = await supabase.from('monthly_charges')
    .select('final_amount, due_on, members!inner(full_name, display_name)')
    .eq('organization_id', orgId).eq('competence', competence).eq('status', 'pending').lt('due_on', today)
    .order('full_name', { referencedTable: 'members' }).limit(500)
  if (error) throw error
  const rows = (data ?? []) as unknown as { final_amount: number; due_on: string; members: { full_name: string; display_name: string | null } }[]
  if (rows.length === 0) return ''
  const total = rows.reduce((s, r) => s + Number(r.final_amount), 0)
  const lines = rows.map((r) => `• ${r.members.display_name ?? r.members.full_name} — ${formatCurrency(Number(r.final_amount))} (venc. ${formatDate(r.due_on)})`)
  return [`*Mensalidades em atraso — ${formatCompetence(competence)}*`, '', ...lines, '', `Total: ${formatCurrency(total)} (${rows.length} ${rows.length === 1 ? 'pessoa' : 'pessoas'})`].join('\n')
}
