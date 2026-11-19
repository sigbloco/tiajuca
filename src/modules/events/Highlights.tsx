import { formatDayShort, formatTime } from '@/core/format'
import type { Activity } from './service'

/** Evento pontual: não vem de uma recorrência (apresentação, confraternização, Cortejo...). */
export const isSpecial = (a: Activity) => !a.recurrence_rule_id

/** "Hoje", "Amanhã" ou "Faltam N dias" para uma data. */
export function daysUntilText(date: string, today: string): string {
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Faltam ${n} dias`
}

/** Eventos em destaque, um por linha, com data/horário, título e contagem lado a lado. Usada no Calendário e no Início. */
export function HighlightCards({ items, today, onPick }: { items: Activity[]; today: string; onPick: (a: Activity) => void }) {
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <button key={a.id} type="button" onClick={() => onPick(a)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10">
          <span className="text-xs font-semibold capitalize leading-tight text-muted-foreground">
            {formatDayShort(a.activity_date)}{a.start_time && <span className="block">{formatTime(a.start_time)}</span>}
          </span>
          <span className="min-w-0 break-words font-semibold leading-tight">{a.title}</span>
          <span className="text-right text-xs font-semibold leading-tight text-primary">
            {daysUntilText(a.activity_date, today)}{a.to_confirm && <span className="block">à confirmar</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
