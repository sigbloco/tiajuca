import { useEffect, useRef, useState } from 'react'
import { formatCurrency, formatDate } from '@/core/format'
import { Input } from './primitives'

/** '15102026' → '15/10/2026' (barras inseridas automaticamente enquanto digita). */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** '15/10/2026' → '2026-10-15', ou null se incompleta/inexistente (ex.: 31/02/2026). */
export function brToIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  const ok = d.getUTCFullYear() === Number(yyyy) && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd)
  return ok && Number(yyyy) >= 1900 ? `${yyyy}-${mm}-${dd}` : null
}

interface DateInputProps {
  id?: string
  /** Valor em ISO (YYYY-MM-DD) ou ''. */
  value: string
  onChange: (iso: string) => void
  required?: boolean
  /** Limites em ISO. */
  min?: string
  max?: string
  maxMessage?: string
  className?: string
  'aria-label'?: string
}

/** Data pt-BR digitada com máscara (sem calendário). Emite ISO só quando a data é válida e dentro dos limites. */
export function DateInput({ id, value, onChange, required, min, max, maxMessage, className, ...rest }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value ? formatDate(value) : '')

  // Sincroniza quando o pai muda o valor (ex.: formulário limpo).
  useEffect(() => {
    if (value === '' && brToIso(text) === null && text.length === 10) return
    if (value !== (brToIso(text) ?? '')) setText(value ? formatDate(value) : '')
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (t: string, iso: string | null) => {
    let msg = ''
    if (t.length === 10 && !iso) msg = 'Data inválida. Use dia/mês/ano, ex.: 15/10/2026.'
    else if (t.length > 0 && t.length < 10) msg = 'Digite a data completa: dd/mm/aaaa.'
    else if (iso && max && iso > max) msg = maxMessage ?? `A data deve ser até ${formatDate(max)}.`
    else if (iso && min && iso < min) msg = `A data deve ser a partir de ${formatDate(min)}.`
    ref.current?.setCustomValidity(msg)
  }
  useEffect(() => validate(text, brToIso(text))) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Input
      {...rest}
      ref={ref}
      id={id}
      className={className}
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      required={required}
      value={text}
      onChange={(e) => {
        const masked = maskDate(e.target.value)
        setText(masked)
        onChange(brToIso(masked) ?? '')
      }}
    />
  )
}

/** (21) 99999-9999 — celular brasileiro com máscara; 10 dígitos formata como fixo. */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function PhoneInput({ value, onChange, id }: { value: string; onChange: (masked: string) => void; id?: string }) {
  return (
    <Input id={id} type="tel" inputMode="numeric" autoComplete="tel" placeholder="(21) 99999-9999" maxLength={15}
      value={value} onChange={(e) => onChange(maskPhone(e.target.value))} />
  )
}

/** HH:MM com máscara (24h), emite 'HH:MM' válido ou ''. */
export function TimeInput({ id, value, onChange, required }: { id?: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const [text, setText] = useState(value)
  useEffect(() => { if (value !== text && (value === '' || /^\d{2}:\d{2}$/.test(value))) setText(value) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input id={id} inputMode="numeric" autoComplete="off" placeholder="hh:mm" maxLength={5} required={required} value={text}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 4)
        const masked = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
        setText(masked)
        const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(masked)
        onChange(ok ? masked : '')
      }} />
  )
}

/** Valor em R$ com máscara (digita só números: 15000 → R$ 150,00). Emite número ou null. */
export function MoneyInput({ id, value, onChange, required }: { id?: string; value: number | null; onChange: (v: number | null) => void; required?: boolean }) {
  return (
    <Input id={id} inputMode="numeric" autoComplete="off" placeholder="R$ 0,00" required={required}
      value={value === null ? '' : formatCurrency(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
        onChange(digits === '' ? null : Number(digits) / 100)
      }} />
  )
}
