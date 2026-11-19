import { formatDayShort, formatTime } from '@/core/format'
import type { Activity } from './service'

/** Evento pontual: não vem de uma recorrência (apresentação, confraternização, Cortejo...). */
export const isSpecial = (a: Activity) => !a.recurrence_rule_id

/** "Hoje", "Amanhã" ou "Faltam N dias" para uma data. */
export function daysUntilText(date: string, today: string): string {
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Faltam ${n} dias`
}

/** Fileira de cartões dos eventos em destaque (rola de lado). Usada no Calendário e no Início. */
export function HighlightCards({ items, today, onPick }: { items: Activity[]; today: string; onPick: (a: Activity) => void }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((a) => (
        <button key={a.id} type="button" onClick={() => onPick(a)} className="w-44 shrink-0 rounded-xl border border-primary/40 bg-primary/5 p-2.5 text-left transition hover:bg-primary/10">
          <p className="text-xs font-semibold capitalize text-muted-foreground">{formatDayShort(a.activity_date)}{a.start_time ? ' · ' + formatTime(a.start_time) : ''}</p>
          <p className="line-clamp-2 break-words font-semibold leading-tight">{a.title}</p>
          <p className="mt-0.5 text-xs font-semibold text-primary">{daysUntilText(a.activity_date, today)}{a.to_confirm ? ' · à confirmar' : ''}</p>
        </button>
      ))}
    </div>
  )
}
