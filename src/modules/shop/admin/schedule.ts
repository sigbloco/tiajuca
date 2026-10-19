/**
 * Agenda de retirada de um ponto: dias fixos da semana (ex.: ensaios às segundas) e/ou datas únicas (eventos).
 * O banco valida e monta o texto mostrado ao cliente; aqui ficam a edição, a validação do formulário e a prévia do painel.
 */
export type ScheduleSlot =
  | { type: 'weekly'; weekday: number; start?: string; end?: string; label?: string }
  | { type: 'date'; date: string; start?: string; end?: string; label?: string }

export const WEEKDAYS_PLURAL = ['Domingos', 'Segundas', 'Terças', 'Quartas', 'Quintas', 'Sextas', 'Sábados']
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const timeText = (t: string) => (t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : `${Number(t.slice(0, 2))}h${t.slice(3)}`)
function hoursText(s: { start?: string; end?: string }): string | null {
  if (s.start && s.end) return `das ${timeText(s.start)} às ${timeText(s.end)}`
  if (s.start) return `a partir das ${timeText(s.start)}`
  if (s.end) return `até às ${timeText(s.end)}`
  return null
}

/** Erros da agenda (lista vazia = pode salvar). Espelha `shop_schedule_valid` (SQL). */
export function validateSchedule(slots: ScheduleSlot[]): string[] {
  const errors: string[] = []
  if (slots.length > 20) errors.push('No máximo 20 horários por ponto.')
  slots.forEach((s, i) => {
    const n = i + 1
    if (s.type === 'weekly' && !(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6)) errors.push(`Horário ${n}: escolha o dia da semana.`)
    if (s.type === 'date' && !isRealDate(s.date)) errors.push(`Horário ${n}: informe uma data válida.`)
    if (s.start && !TIME.test(s.start)) errors.push(`Horário ${n}: hora inicial inválida.`)
    if (s.end && !TIME.test(s.end)) errors.push(`Horário ${n}: hora final inválida.`)
    if (s.start && s.end && TIME.test(s.start) && TIME.test(s.end) && s.start >= s.end) errors.push(`Horário ${n}: a hora final precisa ser depois da inicial.`)
    if (s.label && s.label.length > 60) errors.push(`Horário ${n}: o nome passa de 60 letras.`)
  })
  return errors
}

/** Tira campos vazios (o banco aceita ausência, não texto vazio). */
export function cleanSchedule(slots: ScheduleSlot[]): ScheduleSlot[] {
  return slots.map((s) => {
    const base = s.type === 'weekly' ? { type: 'weekly' as const, weekday: s.weekday } : { type: 'date' as const, date: s.date }
    return { ...base, ...(s.start ? { start: s.start } : {}), ...(s.end ? { end: s.end } : {}), ...(s.label?.trim() ? { label: s.label.trim() } : {}) }
  })
}

/** Prévia no painel (o cliente vê o texto montado pelo banco, que segue as mesmas regras). `today` = AAAA-MM-DD de hoje. */
export function scheduleText(slots: ScheduleSlot[], note: string, today: string): { text: string; expired: number } {
  const label = (s: ScheduleSlot) => (s.label?.trim() ? ` (${s.label.trim()})` : '')
  const hours = (s: ScheduleSlot) => { const h = hoursText(s); return h ? `, ${h}` : '' }
  const weekly = slots.filter((s): s is Extract<ScheduleSlot, { type: 'weekly' }> => s.type === 'weekly')
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || (a.start ?? '').localeCompare(b.start ?? ''))
    .map((s) => `${WEEKDAYS_PLURAL[s.weekday]}${label(s)}${hours(s)}`)
  const dates = slots.filter((s): s is Extract<ScheduleSlot, { type: 'date' }> => s.type === 'date' && isRealDate(s.date))
  const upcoming = dates.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''))
    .map((s) => {
      const [y, m, d] = s.date.split('-').map(Number)
      const dow = WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
      return `${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}${label(s)}${hours(s)}`
    })
  const parts = [...weekly, ...upcoming, note.trim()].filter(Boolean)
  return { text: parts.join(' · '), expired: dates.length - upcoming.length }
}

/** O ponto ainda aparece no checkout? Sem agenda = sempre; com agenda precisa de dia fixo ou data futura. */
export function hasFutureSlot(slots: ScheduleSlot[], today: string): boolean {
  return slots.length === 0 || slots.some((s) => s.type === 'weekly' || (s.type === 'date' && s.date >= today))
}
