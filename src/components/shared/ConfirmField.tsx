import { Check, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Input, Select, cn } from '@/components/ui/primitives'

/** Botões que só aparecem quando há algo a confirmar. */
function Confirm({ label, busy, onConfirm, onCancel }: { label: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Button type="button" size="sm" disabled={busy} onClick={onConfirm}><Check className="h-4 w-4" /> {label}</Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar" disabled={busy} onClick={onCancel}><X className="h-4 w-4" /></Button>
    </span>
  )
}

/** Texto editável: nada é gravado até clicar em "Salvar" (ou Enter). Esc volta ao valor anterior. */
export function SaveInput({ value, onSave, disabled, className, 'aria-label': ariaLabel, placeholder }: {
  value: string
  onSave: (v: string) => Promise<unknown> | unknown
  disabled?: boolean
  className?: string
  'aria-label'?: string
  placeholder?: string
}) {
  const [text, setText] = useState(value)
  const [busy, setBusy] = useState(false)
  useEffect(() => setText(value), [value])
  const dirty = text.trim() !== value && text.trim() !== ''
  const commit = async () => {
    if (!dirty || busy) return
    setBusy(true)
    try { await onSave(text.trim()) } finally { setBusy(false) }
  }
  return (
    <span className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
      <Input className="min-w-0 flex-1 font-semibold" value={text} disabled={disabled || busy} aria-label={ariaLabel} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commit() } if (e.key === 'Escape') setText(value) }} />
      {dirty && <Confirm label="Salvar" busy={busy} onConfirm={() => void commit()} onCancel={() => setText(value)} />}
    </span>
  )
}

/** Lista de escolha: a troca só vale depois de clicar em "OK". */
export function OkSelect({ value, onSave, disabled, className, children, 'aria-label': ariaLabel, id }: {
  value: string
  onSave: (v: string) => Promise<unknown> | unknown
  disabled?: boolean
  className?: string
  children: ReactNode
  'aria-label'?: string
  id?: string
}) {
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  useEffect(() => setV(value), [value])
  const dirty = v !== value
  const commit = async () => {
    setBusy(true)
    try { await onSave(v) } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select id={id} className={className} value={v} disabled={disabled || busy} aria-label={ariaLabel} onChange={(e) => setV(e.target.value)}>{children}</Select>
      {dirty && <Confirm label="OK" busy={busy} onConfirm={() => void commit()} onCancel={() => setV(value)} />}
    </span>
  )
}
