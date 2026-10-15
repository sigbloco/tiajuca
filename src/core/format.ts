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
