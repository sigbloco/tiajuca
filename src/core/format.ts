// Formatação pt-BR. Datas "de calendário" (YYYY-MM-DD) nunca passam por conversão de fuso.
export const DEFAULT_TZ = 'America/Sao_Paulo'

/** '2026-10-15' → '15/10/2026' (puro, sem Date/timezone). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

export function formatDateTime(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: tz }).format(new Date(iso))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** '2026-10-01' (ou '2026-10') → 'Outubro de 2026'. */
export function formatCompetence(value: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(value)
  if (!m) return value
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)),
  )
  const [month, , year] = label.split(' ')
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${year}`
}

/** Data mínima de nascimento para ser maior de idade (YYYY-MM-DD), para validar o campo de data. */
export function adultBirthDateMax(minAge = 18, now = new Date()): string {
  const d = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate())
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Data de hoje (YYYY-MM-DD) no fuso da organização — evita o "dia errado" de toISOString() em UTC. */
export function todayIso(tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** '19:00:00' → '19:00'. */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

/** '2026-10-15' → 'quinta-feira, 15 de outubro'. */
export function formatDayLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  )
}

const WD3 = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

/** Curto: "SEG · 16/11" (com horário: "SEG · 16/11 · 19:30"). */
export function formatDayShort(iso: string, time?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const wd = WD3[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]
  return `${wd} · ${m[3]}/${m[2]}${time ? ` · ${time.slice(0, 5)}` : ''}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Dias exibidos no calendário mensal (semanas completas, domingo a sábado). */
export function monthGridDays(year: number, month0: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month0, 1))
  const start = new Date(first)
  start.setUTCDate(1 - first.getUTCDay())
  const last = new Date(Date.UTC(year, month0 + 1, 0))
  const end = new Date(last)
  end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()))
  const days: { iso: string; inMonth: boolean }[] = []
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push({ iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, inMonth: d.getUTCMonth() === month0 })
  }
  return days
}

export function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)!
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

const normName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
// Segundos nomes comuns: "Ana Luísa", "João Pedro", "Maria Clara" (sem acento, minúsculos).
const SECOND_GIVEN = new Set(('ana maria luisa luiza luiz luis clara beatriz paula julia eduarda eduardo fernanda fernando carolina cristina helena laura lucia vitoria victoria gabriela gabriel isabel isabela isabella joao jose pedro paulo carlos antonio augusto henrique felipe miguel rafael rodrigo roberto marcelo vinicius victor marcos andre alexandre daniel lucas matheus guilherme leonardo leandro thiago tiago gustavo renato ricardo sergio valeria elisa eliza rita sofia sophia alice aline amanda bianca camila claudia daniela flavia leticia livia marina mariana patricia renata sara sandra tereza teresa vanessa viviane raquel rosa regina silvia simone stella estela cecilia antonia angela adriana juliana larissa natalia nicole olivia luana lara manuela emilia francisco fabio bruno diego caio davi david samuel jorge mauricio nelson otavio raul ronaldo rogerio').split(' '))
const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

/** Nome de batismo para tratar a pessoa: "Ana" (de "Ana Silva") ou "Ana Luísa" quando o primeiro nome é composto.
 *  Detecta nome duplo se o "como prefere ser chamado" é as duas primeiras palavras do nome, ou se a segunda palavra é um segundo nome comum. */
export function givenName(fullName: string | null | undefined, displayName?: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  const [a, b] = parts
  if (!a) return ''
  if (!b || PARTICLES.has(normName(b))) return a
  const pref = normName(displayName ?? '')
  if (pref === normName(a + ' ' + b) || SECOND_GIVEN.has(normName(b))) return a + ' ' + b
  return a
}

/** Como mostrar uma pessoa nas listas: o primeiro nome e, se ela tiver um "como gostaria de ser chamado" diferente, entre parênteses. */
export function shortName(fullName: string | null | undefined, displayName?: string | null): string {
  const first = givenName(fullName, displayName)
  const pref = (displayName ?? '').trim()
  if (!first) return pref
  // Apelido que já é uma parte do nome ("Ana" para "Ana Luísa") não precisa de parênteses.
  const same = normName(pref) === normName(first) || normName(first).split(' ').includes(normName(pref))
  return pref && !same ? `${first} (${pref})` : first
}
