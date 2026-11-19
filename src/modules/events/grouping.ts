import type { Activity } from './service'

/** Eventos do mesmo dia e do mesmo horário de início: no Início viram um cartão só. Sem horário não mescla (não dá para saber que é "ao mesmo tempo"). */
export interface EventGroup { key: string; start: string | null; items: Activity[] }

export function groupSimultaneous(list: Activity[]): EventGroup[] {
  const out: EventGroup[] = []
  const byKey = new Map<string, EventGroup>()
  for (const a of list) {
    const start = a.start_time ? a.start_time.slice(0, 5) : null
    if (!start) { out.push({ key: a.id, start, items: [a] }); continue }
    const k = `${a.activity_date}|${start}`
    const g = byKey.get(k)
    if (g) g.items.push(a)
    else { const ng = { key: k, start, items: [a] }; byKey.set(k, ng); out.push(ng) }
  }
  return out
}
