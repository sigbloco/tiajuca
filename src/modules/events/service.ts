import { supabase } from '@/core/supabase'

export type TypeColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'muted'

// Classes completas (o Tailwind precisa enxergá-las no código). Cores vêm dos tokens de tema.
export const COLOR_DOT: Record<TypeColor, string> = {
  primary: 'bg-primary', secondary: 'bg-secondary', info: 'bg-info', success: 'bg-success', warning: 'bg-warning', muted: 'bg-muted-foreground',
}
export const COLOR_BADGE: Record<TypeColor, string> = {
  primary: 'bg-primary/15 text-primary', secondary: 'bg-secondary/40 text-foreground', info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success', warning: 'bg-warning/15 text-warning', muted: 'bg-muted text-muted-foreground',
}
export const COLOR_LABEL: Record<TypeColor, string> = {
  primary: 'Vermelho (marca)', secondary: 'Amarelo (marca)', info: 'Azul', success: 'Verde', warning: 'Laranja', muted: 'Cinza',
}

export interface Activity {
  id: string
  activity_type_id: string
  cycle_id: string | null
  title: string
  activity_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  status: 'scheduled' | 'done' | 'cancelled'
  visibility: 'members' | 'staff'
  recurrence_rule_id: string | null
  activity_types: { name: string; color: TypeColor } | null
}

export const STATUS_LABEL: Record<Activity['status'], string> = { scheduled: 'Agendado', done: 'Realizado', cancelled: 'Cancelado' }
export const VISIBILITY_LABEL: Record<Activity['visibility'], string> = { members: 'Todos os integrantes', staff: 'Somente equipe' }

const SELECT = 'id, activity_type_id, cycle_id, title, activity_date, start_time, end_time, location, description, status, visibility, recurrence_rule_id, activity_types(name, color)'

export async function listActivities(p: { orgId: string; from: string; to: string; cycleId?: string; typeId?: string }) {
  let q = supabase
    .from('activities')
    .select(SELECT)
    .eq('organization_id', p.orgId)
    .gte('activity_date', p.from)
    .lte('activity_date', p.to)
    .order('activity_date')
    .order('start_time', { nullsFirst: true })
  if (p.cycleId) q = q.eq('cycle_id', p.cycleId)
  if (p.typeId) q = q.eq('activity_type_id', p.typeId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as Activity[]
}

export interface ActivityInput {
  title: string
  activity_type_id: string
  activity_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  cycle_id: string | null
  visibility: Activity['visibility']
}

export type AudienceKind = 'section' | 'subsection' | 'instrument'
export interface AudienceInput { kind: AudienceKind; ref_id: string }

export async function getAudience(activityId: string): Promise<AudienceInput | null> {
  const { data, error } = await supabase.from('activity_audiences').select('kind, ref_id').eq('activity_id', activityId).limit(1)
  if (error) throw error
  const row = data?.[0] as AudienceInput | undefined
  return row ?? null
}

async function replaceAudience(orgId: string, activityId: string, audience: AudienceInput | null) {
  const del = await supabase.from('activity_audiences').delete().eq('activity_id', activityId)
  if (del.error) throw del.error
  if (audience) {
    const ins = await supabase.from('activity_audiences').insert({ organization_id: orgId, activity_id: activityId, ...audience })
    if (ins.error) throw ins.error
  }
}

export async function saveActivity(orgId: string, id: string | null, input: ActivityInput, audience: AudienceInput | null) {
  if (id) {
    const { error } = await supabase.from('activities').update(input).eq('id', id).eq('organization_id', orgId)
    if (error) throw error
    await replaceAudience(orgId, id, audience)
    return id
  }
  const { data, error } = await supabase.from('activities').insert({ ...input, organization_id: orgId }).select('id').single()
  if (error) throw error
  await replaceAudience(orgId, data.id as string, audience)
  return data.id as string
}

export async function setActivityStatus(orgId: string, id: string, status: Activity['status']) {
  const { error } = await supabase.from('activities').update({ status }).eq('id', id).eq('organization_id', orgId)
  if (error) throw error
}

export async function materialize(orgId: string, until: string): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_recurrences', { p_org: orgId, p_until: until })
  if (error) throw error
  return (data as number) ?? 0
}
