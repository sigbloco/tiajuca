import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { formatDayShort, formatTime } from '@/core/format'
import type { Activity } from './service'

/** Evento pontual: não vem de uma recorrência (apresentação, confraternização, Cortejo...). */
export const isSpecial = (a: Activity) => !a.recurrence_rule_id

/** "Hoje", "Amanhã" ou "Faltam N dias" para uma data; na versão curta (layout apertado), "Em N dias". */
export function daysUntilText(date: string, today: string, short = false): string {
  const n = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Hoje' : n === 1 ? 'Amanhã' : short ? `Em ${n} dias` : `Faltam ${n} dias`
}

/** "14:00" → "14h", "14:30" → "14h30". */
const hourLabel = (t: string) => { const [h, m] = formatTime(t).split(':'); return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}` }

const ROW = 'flex items-baseline gap-x-1.5 gap-y-0.5'
const WHEN = 'text-sm font-semibold capitalize text-muted-foreground'
const COUNT = 'text-xs font-bold uppercase text-primary'

/** Uma linha do destaque. Se a linha inteira com "FALTAM N DIAS" não couber, troca por "EM N DIAS" (só quebra se nem assim couber). */
function HighlightRow({ a, today, onPick, short, onNeed }: { a: Activity; today: string; onPick: (a: Activity) => void; short: boolean; onNeed: (id: string, need: boolean) => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const when = `${formatDayShort(a.activity_date)}${a.start_time ? ` · ${hourLabel(a.start_time)}` : ''} ·`
  const confirm = a.to_confirm ? ' · a confirmar' : ''
  const long = daysUntilText(a.activity_date, today) + confirm
  useLayoutEffect(() => {
    const el = btn.current
    if (!el) return
    const check = () => {
      const cs = getComputedStyle(el)
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      onNeed(a.id, (probe.current?.offsetWidth ?? 0) > avail)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { ro.disconnect(); onNeed(a.id, false) }
  }, [long, when, a.title, a.id, onNeed])
  return (
    <button ref={btn} type="button" onClick={() => onPick(a)} className={`relative w-full flex-wrap overflow-hidden rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10 ${ROW}`}>
      <span className={WHEN}>{when}</span>
      <span className="font-semibold">{a.title}</span>
      <span className={COUNT}>{short ? daysUntilText(a.activity_date, today, true) + confirm : long}</span>
      {/* Medida da linha inteira com a versão longa, numa linha só (invisível). */}
      <span ref={probe} aria-hidden className={`pointer-events-none invisible absolute left-0 top-0 -z-10 w-max whitespace-nowrap ${ROW}`}>
        <span className={WHEN}>{when}</span><span className="font-semibold">{a.title}</span><span className={COUNT}>{long}</span>
      </span>
    </button>
  )
}

/** Eventos em destaque, um por linha: "sáb · 13/02 · 14h · Cortejo  FALTAM 86 DIAS". Usada no Calendário e no Início. */
export function HighlightCards({ items, today, onPick }: { items: Activity[]; today: string; onPick: (a: Activity) => void }) {
  // Se uma linha precisa da versão curta ("EM N DIAS"), todas passam a usá-la, para a lista ficar uniforme.
  const [needs, setNeeds] = useState<Set<string>>(() => new Set())
  const onNeed = useCallback((id: string, need: boolean) => {
    setNeeds((cur) => {
      if (cur.has(id) === need) return cur
      const next = new Set(cur)
      if (need) next.add(id); else next.delete(id)
      return next
    })
  }, [])
  const short = needs.size > 0
  return (
    <div className="space-y-2">
      {items.map((a) => <HighlightRow key={a.id} a={a} today={today} onPick={onPick} short={short} onNeed={onNeed} />)}
    </div>
  )
}
