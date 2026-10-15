import { useQuery } from '@tanstack/react-query'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

export interface FinCategory { id: string; kind: 'income' | 'expense'; name: string; is_active: boolean }
export interface LedgerRow {
  ref: string
  occurred_on: string
  kind: 'income' | 'expense'
  amount: number
  description: string
  category: string
  source: 'lancamento' | 'mensalidade' | 'equipe'
}
export interface MonthSummary { receita_mensalidades: number; receita_outras: number; despesas: number; pagamentos_equipe: number; saldo: number }
export interface Destination { id: string; name: string; kind: string; role_key: string | null; is_active: boolean; sort_order: number }
export interface Rule {
  id: string; destination_id: string; mode: 'percent' | 'fixed'; percent: number | null; fixed_amount: number | null
  base: 'gross_income' | 'net_after_fixed' | 'net_after_expenses' | null; valid_from: string; is_active: boolean; valid_to: string | null
}
export interface DistRow { destination_id: string; destination_name: string; fixed_total: number; percent_total: number; total: number }
export interface StaffPayment {
  id: string; member_id: string; competence: string; amount: number; status: 'pending' | 'paid' | 'cancelled'
  due_on: string | null; paid_on: string | null; payment_method: string | null; pix_key_snapshot: string | null; notes: string | null
  members?: { full_name: string; display_name: string | null } | null
  distribution_destinations?: { name: string } | null
}

export const BASE_LABEL: Record<NonNullable<Rule['base']>, string> = {
  gross_income: 'da receita bruta',
  net_after_fixed: 'da receita após os valores fixos',
  net_after_expenses: 'da receita após as despesas',
}
export const PAY_STATUS_LABEL = { pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' } as const
export const PAY_STATUS_CLASS = { pending: 'bg-warning/15 text-warning', paid: 'bg-success/15 text-success', cancelled: 'bg-muted text-muted-foreground' } as const

export function useFinCategories() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['fin-categories', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('finance_categories').select('id, kind, name, is_active').eq('organization_id', orgId).order('sort_order').order('name')
      if (error) throw error
      return (data ?? []) as FinCategory[]
    },
  })
}

export function useDestinations() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['fin-destinations', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('distribution_destinations').select('*').eq('organization_id', orgId).order('sort_order').order('name')
      if (error) throw error
      return (data ?? []) as Destination[]
    },
  })
}

export const monthRange = (competence: string) => {
  const [y, m] = competence.split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1))
  return { from: competence, to: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01` }
}
