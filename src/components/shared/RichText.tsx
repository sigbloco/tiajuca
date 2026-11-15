import { Bold, Italic, Link2, List } from 'lucide-react'
import { Fragment, useRef, type ReactNode } from 'react'
import { Button, cn } from '@/components/ui/primitives'

/**
 * Texto com formatação simples, guardado como texto comum (sem HTML, então não há risco de código embutido):
 *   **negrito** · *itálico* · [texto do link](https://endereço) · linhas começando com "- " viram lista.
 */
export type Inline = { t: 'text'; s: string } | { t: 'b' | 'i'; c: Inline[] } | { t: 'a'; c: Inline[]; href: string }

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g

/** Aceita formatação dentro de formatação (ex.: link dentro de negrito: **[texto](https://…)**). */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ t: 'text', s: text.slice(last, at) })
    if (m[1] !== undefined) out.push({ t: 'b', c: parseInline(m[1]) })
    else if (m[2] !== undefined) out.push({ t: 'i', c: parseInline(m[2]) })
    else out.push({ t: 'a', c: parseInline(m[3]), href: m[4] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) })
  return out
}

export type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'gap' }

export function parseBlocks(text: string): Block[] {
  const out: Block[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const li = /^\s*[-•]\s+(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (li) { if (last?.kind === 'ul') last.items.push(li[1]); else out.push({ kind: 'ul', items: [li[1]] }) }
    else if (line.trim() !== '') out.push({ kind: 'p', text: line })
    else if (out.length > 0) out.push({ kind: 'gap' }) // linha em branco = espaço (cada uma conta)
  }
  while (out[out.length - 1]?.kind === 'gap') out.pop()
  return out
}

function renderNodes(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.t === 'text') return <Fragment key={i}>{n.s}</Fragment>
    if (n.t === 'b') return <strong key={i}>{renderNodes(n.c)}</strong>
    if (n.t === 'i') return <em key={i}>{renderNodes(n.c)}</em>
    if (n.t === 'a') return <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" className="font-semibold text-primary underline">{renderNodes(n.c)}</a>
    return null
  })
}
const renderInline = (text: string): ReactNode => renderNodes(parseInline(text))

/** Mostra o texto formatado (parágrafos e listas). */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {parseBlocks(text).map((b, i) => b.kind === 'gap' ? <div key={i} aria-hidden className="h-3" /> : b.kind === 'ul'
        ? <ul key={i} className="list-disc space-y-0.5 pl-5">{b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}</ul>
        : <p key={i}>{renderInline(b.text)}</p>)}
    </div>
  )
}

/** Caixa de texto com barra de formatação (negrito, itálico, lista e link). */
export function RichTextarea({ value, onChange, rows = 4, id, maxLength, className, extra }: { value: string; onChange: (v: string) => void; rows?: number; id?: string; maxLength?: number; className?: string; /** Conteúdo embaixo da caixa que recebe `insert`: coloca um texto onde está o cursor (ex.: variáveis clicáveis). */ extra?: (insert: (text: string) => void) => ReactNode }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply = (fn: (sel: string) => { text: string; from: number; to: number }) => {
    const el = ref.current
    if (!el) return
    const a = el.selectionStart, b = el.selectionEnd
    const r = fn(value.slice(a, b))
    onChange(value.slice(0, a) + r.text + value.slice(b))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + r.from, a + r.to) })
  }
  const wrap = (mark: string, placeholder: string) => apply((sel) => {
    const inner = sel || placeholder
    return { text: mark + inner + mark, from: mark.length, to: mark.length + inner.length }
  })
  const list = () => apply((sel) => {
    const text = (sel || 'item').split('\n').map((l) => (/^\s*[-•]\s/.test(l) ? l : `- ${l}`)).join('\n')
    return { text, from: 0, to: text.length }
  })
  const link = () => {
    const url = window.prompt('Endereço do link (começa com https://)')?.trim()
    if (!url) return
    if (!/^(https?:\/\/|mailto:)\S+$/.test(url)) { window.alert('Use um endereço que comece com https:// (ou mailto:).'); return }
    apply((sel) => { const label = sel || 'texto do link'; return { text: `[${label}](${url})`, from: 1, to: 1 + label.length } })
  }
  const insert = (text: string) => {
    const el = ref.current
    const a = el ? el.selectionStart : value.length
    const b = el ? el.selectionEnd : value.length
    onChange(value.slice(0, a) + text + value.slice(b))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length) })
  }
  const tool = 'h-8 w-8'
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex gap-1" role="toolbar" aria-label="Formatação do texto">
        <Button type="button" size="icon" variant="outline" className={tool} aria-label="Negrito" title="Negrito" onClick={() => wrap('**', 'negrito')}><Bold className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className={tool} aria-label="Itálico" title="Itálico" onClick={() => wrap('*', 'itálico')}><Italic className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className={tool} aria-label="Lista" title="Lista" onClick={list}><List className="h-4 w-4" /></Button>
        <Button type="button" size="icon" variant="outline" className={tool} aria-label="Link" title="Link" onClick={link}><Link2 className="h-4 w-4" /></Button>
      </div>
      <textarea ref={ref} id={id} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
      {extra?.(insert)}
    </div>
  )
}
