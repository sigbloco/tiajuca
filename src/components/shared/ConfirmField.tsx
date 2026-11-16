import { useEffect, useState, type ReactNode } from 'react'
import { useUnsaved } from '@/core/unsaved'
import { Input, Select, cn } from '@/components/ui/primitives'

/** Texto editável: grava sozinho ao sair do campo ou apertar Enter (regra do app: salvar é automático ou pelo botão fixo da página). Esc volta ao valor anterior. */
export function SaveInput({ value, onSave, disabled, className, inputClassName, numeric, allowEmpty, 'aria-label': ariaLabel, placeholder }: {
  /** Deixa gravar o campo vazio (ex.: "sem limite"). */
  allowEmpty?: boolean
  /** Só aceita dígitos (teclado numérico no celular). */
  numeric?: boolean
  /** Mantido por compatibilidade: agora todo campo grava sozinho. */
  autoSave?: boolean
  /** Classes do campo em si (ex.: largura fixa). */
  inputClassName?: string
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
  const dirty = text.trim() !== value && (allowEmpty || text.trim() !== '')
  const commit = async () => {
    if (!dirty || busy) return
    setBusy(true)
    try { await onSave(text.trim()) } catch { setText(value) } finally { setBusy(false) }
  }
  useUnsaved(dirty, commit)
  return (
    <span className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)}>
      <Input className={cn('min-w-0 flex-1 font-semibold', inputClassName)} inputMode={numeric ? 'numeric' : undefined} value={text} disabled={disabled || busy} aria-label={ariaLabel} placeholder={placeholder}
        onBlur={() => void commit()}
        onChange={(e) => setText(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commit() } if (e.key === 'Escape') setText(value) }} />
    </span>
  )
}

/** Lista de escolha: a troca é gravada na hora (sem botão de confirmar). */
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
  const change = async (next: string) => {
    if (next === value) return
    setV(next)
    setBusy(true)
    try { await onSave(next) } catch { setV(value) } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select id={id} className={className} value={v} disabled={disabled || busy} aria-label={ariaLabel} onChange={(e) => void change(e.target.value)}>{children}</Select>
    </span>
  )
}
