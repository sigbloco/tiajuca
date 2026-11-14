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

/** Item do roteiro: início (`time`), fim, nome (`label`), local e descrição. */
export interface ItineraryStep { time: string; label: string; end?: string; location?: string; description?: string }
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
  cancel_reason?: string | null
  visibility: 'members' | 'staff'
  recurrence_rule_id: string | null
  itinerary: ItineraryStep[] | null
  activity_types: { id?: string; name: string; color: TypeColor } | null
  /** Evento com chamada de presença? (nem tudo tem). */
  has_attendance: boolean
  /** Rótulos extras (além do principal, que é o tipo do evento). */
  activity_type_links?: { activity_types: { id: string; name: string; color: TypeColor } | null }[] | null
}

export interface EventLabel { id: string; name: string; color: TypeColor }
/** Rótulos do evento: o principal (tipo, que dá a cor) primeiro e depois os demais, sem repetir. */
export function labelsOf(a: Pick<Activity, 'activity_types' | 'activity_type_links' | 'activity_type_id'>): EventLabel[] {
  const out: EventLabel[] = []
  if (a.activity_types) out.push({ id: a.activity_types.id ?? a.activity_type_id, name: a.activity_types.name, color: a.activity_types.color })
  for (const l of a.activity_type_links ?? []) if (l.activity_types && !out.some((x) => x.id === l.activity_types!.id)) out.push(l.activity_types)
  return out
}

export const STATUS_LABEL: Record<Activity['status'], string> = { scheduled: 'Agendado', done: 'Realizado', cancelled: 'Cancelado' }
export const VISIBILITY_LABEL: Record<Activity['visibility'], string> = { members: 'Todos os integrantes', staff: 'Somente equipe' }

const SELECT = 'id, activity_type_id, cycle_id, title, activity_date, start_time, end_time, location, description, status, visibility, recurrence_rule_id, itinerary, cancel_reason, has_attendance, activity_types(id, name, color), activity_type_links(activity_types(id, name, color))'

/** `trashed`: só os da lixeira (padrão: só os que não foram apagados). */
export async function listActivities(p: { orgId: string; from: string; to: string; cycleId?: string; typeId?: string; trashed?: boolean }) {
  let q = supabase
    .from('activities')
    .select(SELECT)
    .eq('organization_id', p.orgId)
    .gte('activity_date', p.from)
    .lte('activity_date', p.to)
    .order('activity_date')
    .order('start_time', { nullsFirst: true })
  q = p.trashed ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
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
  itinerary: ItineraryStep[] | null
  has_attendance: boolean
}

export type AudienceKind = 'section' | 'instrument' | 'category'
export interface AudienceInput { kind: AudienceKind; ref_id: string }

/** Público de vários eventos de uma vez (id do evento → itens). Evento sem público não aparece no mapa. */
export async function getAudiencesFor(activityIds: string[]): Promise<Map<string, AudienceInput[]>> {
  const out = new Map<string, AudienceInput[]>()
  if (activityIds.length === 0) return out
  const { data, error } = await supabase.from('activity_audiences').select('activity_id, kind, ref_id').in('activity_id', activityIds).limit(5000)
  if (error) throw error
  for (const a of (data ?? []) as { activity_id: string; kind: string; ref_id: string }[]) {
    if (a.kind !== 'section' && a.kind !== 'instrument' && a.kind !== 'category') continue
    out.set(a.activity_id, [...(out.get(a.activity_id) ?? []), { kind: a.kind, ref_id: a.ref_id }])
  }
  return out
}

/** Naipes (ids) a que o público de um evento pertence: o naipe escolhido ou o naipe do instrumento escolhido. */
export function audienceSectionIds(audience: AudienceInput[], instrumentSection: Map<string, string>): Set<string> {
  const ids = new Set<string>()
  for (const a of audience) {
    if (a.kind === 'category') continue
    const sid = a.kind === 'section' ? a.ref_id : instrumentSection.get(a.ref_id)
    if (sid) ids.add(sid)
  }
  return ids
}

/** Público da chamada de um evento: vários itens (naipe ou instrumento). */
export async function getAudiences(activityId: string): Promise<AudienceInput[]> {
  const { data, error } = await supabase.from('activity_audiences').select('kind, ref_id').eq('activity_id', activityId)
  if (error) throw error
  return ((data ?? []) as AudienceInput[]).filter((a) => a.kind === 'section' || a.kind === 'instrument' || a.kind === 'category')
}

async function replaceAudience(orgId: string, activityId: string, audiences: AudienceInput[]) {
  const del = await supabase.from('activity_audiences').delete().eq('activity_id', activityId)
  if (del.error) throw del.error
  if (audiences.length > 0) {
    const ins = await supabase.from('activity_audiences').insert(audiences.map((a) => ({ organization_id: orgId, activity_id: activityId, ...a })))
    if (ins.error) throw ins.error
  }
}

async function replaceLabels(orgId: string, activityId: string, typeIds: string[]) {
  const del = await supabase.from('activity_type_links').delete().eq('activity_id', activityId)
  if (del.error) throw del.error
  if (typeIds.length > 0) {
    const ins = await supabase.from('activity_type_links').insert(typeIds.map((t) => ({ organization_id: orgId, activity_id: activityId, activity_type_id: t })))
    if (ins.error) throw ins.error
  }
}

/** `typeIds`: rótulos escolhidos (o primeiro é o tipo principal, que dá a cor). */
export async function saveActivity(orgId: string, id: string | null, input: ActivityInput, audiences: AudienceInput[], typeIds?: string[]) {
  if (id) {
    // Ocorrência de recorrência editada à mão fica "personalizada": a sincronização da regra não a sobrescreve.
    const { data: cur } = await supabase.from('activities').select('recurrence_rule_id').eq('id', id).maybeSingle()
    const { error } = await supabase.from('activities').update(cur?.recurrence_rule_id ? { ...input, customized: true } : input).eq('id', id).eq('organization_id', orgId)
    if (error) throw error
    await replaceAudience(orgId, id, audiences)
    if (typeIds) await replaceLabels(orgId, id, typeIds)
    return id
  }
  const { data, error } = await supabase.from('activities').insert({ ...input, organization_id: orgId }).select('id').single()
  if (error) throw error
  await replaceAudience(orgId, data.id as string, audiences)
  if (typeIds) await replaceLabels(orgId, data.id as string, typeIds)
  return data.id as string
}

/** Nome do que está sendo cancelado: "aula" (oficina), "ensaio" ou "evento". */
export const cancelWord = (typeName?: string | null) => (typeName === 'Oficina' ? 'aula' : typeName === 'Ensaio' ? 'ensaio' : 'evento')

export async function setActivityStatus(orgId: string, id: string, status: Activity['status'], reason?: string | null) {
  const { error } = await supabase.from('activities').update({ status, cancel_reason: status === 'cancelled' ? (reason?.trim() || null) : null }).eq('id', id).eq('organization_id', orgId)
  if (error) throw error
}

async function activityRpc(fn: 'trash_activity' | 'restore_activity' | 'delete_activity', id: string) {
  const { error } = await supabase.rpc(fn, { p_activity: id })
  if (error) throw error
}
/** Apagar = mandar para a lixeira (dá para restaurar). */
export const trashActivity = (id: string) => activityRpc('trash_activity', id)
export const restoreActivity = (id: string) => activityRpc('restore_activity', id)
/** Excluir de vez (só da lixeira). */
export const purgeActivity = (id: string) => activityRpc('delete_activity', id)

export async function materialize(orgId: string, until: string): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_recurrences', { p_org: orgId, p_until: until })
  if (error) throw error
  return (data as number) ?? 0
}

/** Leva o horário, local, descrição e roteiro das recorrências (ativas, ou só a indicada) para as próximas ocorrências já geradas e ainda agendadas. */
export async function syncOccurrences(orgId: string, today: string, ruleId?: string): Promise<number> {
  let q = supabase.from('recurrence_rules').select('id, title, start_time, end_time, location, description, itinerary, audiences, has_attendance, extra_type_ids, activity_type_id').eq('organization_id', orgId).eq('is_active', true)
  if (ruleId) q = q.eq('id', ruleId)
  const { data: rules, error } = await q
  if (error) throw error
  let n = 0
  for (const r of rules ?? []) {
    const { data, error: e2 } = await supabase.from('activities')
      .update({ title: r.title, start_time: r.start_time, end_time: r.end_time, location: r.location, description: r.description, itinerary: r.itinerary, has_attendance: r.has_attendance, activity_type_id: r.activity_type_id })
      .eq('recurrence_rule_id', r.id).eq('status', 'scheduled').eq('customized', false).gte('activity_date', today).select('id')
    if (e2) throw e2
    n += data?.length ?? 0
    // Público da chamada da recorrência vai para essas mesmas datas.
    const ids = (data ?? []).map((x) => x.id as string)
    if (ids.length > 0) {
      const dl = await supabase.from('activity_type_links').delete().in('activity_id', ids)
      if (dl.error) throw dl.error
      const extra = ((r.extra_type_ids ?? []) as string[]).filter((t) => t !== r.activity_type_id)
      if (extra.length > 0) {
        const il = await supabase.from('activity_type_links').insert(ids.flatMap((id) => extra.map((t) => ({ organization_id: orgId, activity_id: id, activity_type_id: t }))))
        if (il.error) throw il.error
      }
      const del = await supabase.from('activity_audiences').delete().in('activity_id', ids)
      if (del.error) throw del.error
      const auds = (r.audiences ?? []) as { kind: string; ref: string }[]
      if (auds.length > 0) {
        const ins = await supabase.from('activity_audiences').insert(ids.flatMap((id) => auds.map((a) => ({ organization_id: orgId, activity_id: id, kind: a.kind, ref_id: a.ref }))))
        if (ins.error) throw ins.error
      }
    }
  }
  return n
}

/** Cor escolhida no evento/recorrência → tipo existente dessa cor (ou cria um com o nome da cor). */
export async function typeIdForColor(orgId: string, color: TypeColor): Promise<string> {
  const { data, error } = await supabase.from('activity_types').select('id, color, is_active, sort_order').eq('organization_id', orgId)
  if (error) throw error
  const list = data ?? []
  const found = list.find((t) => t.color === color && t.is_active) ?? list.find((t) => t.color === color)
  if (found) return found.id
  const { data: created, error: e2 } = await supabase.from('activity_types')
    .insert({ organization_id: orgId, name: COLOR_LABEL[color], color, sort_order: list.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0) + 1 }).select('id').single()
  if (e2) throw e2
  return created.id
}

export interface ActivityTypeRow { id: string; name: string; color: TypeColor; sort_order: number; is_active: boolean; attendance_default: boolean }
export async function listActivityTypes(orgId: string): Promise<ActivityTypeRow[]> {
  const { data, error } = await supabase.from('activity_types').select('id, name, color, sort_order, is_active, attendance_default').eq('organization_id', orgId).order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as ActivityTypeRow[]
}
