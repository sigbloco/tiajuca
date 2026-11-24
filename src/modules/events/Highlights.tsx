import { formatDayShort, formatTime } from '@/core/format'
import type { Activity } from './service'

/** Evento pontual: não vem de uma recorrência (apresentação, confraternização, Cortejo...). */
export const isSpecial = (a: Activity) => !a.recurrence_rule_id

/** "Hoje", "Amanhã" ou "Faltam N dias" para uma data. */
export function daysUntilText(date: string, today: string): string {
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Faltam ${n} dias`
}

/** "14:00" → "14h", "14:30" → "14h30". */
const hourLabel = (t: string) => { const [h, m] = formatTime(t).split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}` }

/** Eventos em destaque, um por linha: "sáb · 13/02 · 14h · Cortejo  FALTAM 86 DIAS". Usada no Calendário e no Início. */
export function HighlightCards({ items, today, onPick }: { items: Activity[]; today: string; onPick: (a: Activity) => void }) {
  return (
    <div className="space-y-2">
      {items.map((a) => (
        // Tudo numa linha: "sáb · 13/02 · 14h · Cortejo  FALTAM 86 DIAS" (quebra só se não couber).
        <button key={a.id} type="button" onClick={() => onPick(a)} className="flex w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10">
          <span className="text-sm font-semibold capitalize text-muted-foreground">{formatDayShort(a.activity_date)}{a.start_time ? ` · ${hourLabel(a.start_time)}` : ''} ·</span>
          <span className="font-semibold">{a.title}</span>
          <span className="text-xs font-bold uppercase text-primary">{daysUntilText(a.activity_date, today)}{a.to_confirm ? ' · a confirmar' : ''}</span>
        </button>
      ))}
    </div>
  )
}
