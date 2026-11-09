import { Children, isValidElement, useState, type ReactNode } from 'react'

/** Texto de um nó React (ignora a formatação): usado para achar a primeira frase. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return Children.toArray(node.props.children).map(textOf).join('')
  return ''
}

const LIMIT = 110

/**
 * Texto descritivo de página: mostra só a primeira frase e "Ler mais"; aberto, mostra tudo e "Esconder".
 * Textos curtos aparecem inteiros, sem botão.
 */
export function ReadMore({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const full = textOf(children).replace(/\s+/g, ' ').trim()
  const first = /^.*?[.!?](?=\s|$)/.exec(full)?.[0] ?? full
  const short = full.length <= LIMIT || first.length >= full.length - 2
  const btn = 'ml-1 font-semibold text-primary hover:underline'
  if (short) return <p className="text-muted-foreground">{children}</p>
  return (
    <p className="text-muted-foreground">
      {open ? children : first}
      <button type="button" className={btn} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Esconder' : 'Ler mais'}</button>
    </p>
  )
}
