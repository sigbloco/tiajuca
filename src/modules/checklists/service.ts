import { supabase } from '@/core/supabase'

export type ItemStatus = 'todo' | 'doing' | 'done'
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { todo: 'A fazer', doing: 'Em andamento', done: 'Feito' }
export const NEXT_STATUS: Record<ItemStatus, ItemStatus> = { todo: 'doing', doing: 'done', done: 'todo' }

export interface ChecklistItem {
  id: string
  title: string
  status: ItemStatus
  assignee_member_id: string | null
  notes: string | null
  sort_order: number
  members: { full_name: string; display_name: string | null } | null
}
export interface Template { id: string; name: string; is_active: boolean }
export interface TemplateItem { id: string; template_id: string; title: string; sort_order: number; is_active: boolean }

export async function listChecklist(activityId: string) {
  const { data, error } = await supabase.from('activity_checklist_items')
    .select('id, title, status, assignee_member_id, notes, sort_order, members(full_name, display_name)')
    .eq('activity_id', activityId).order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as ChecklistItem[]
}

export async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const progress = (items: { status: ItemStatus }[]) => {
  const total = items.length
  const done = items.filter((i) => i.status === 'done').length
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}
