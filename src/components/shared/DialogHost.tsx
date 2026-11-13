import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, Check, HelpCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Input } from '@/components/ui/primitives'

/**
 * Caixas de diálogo no estilo "lightbox", no lugar dos alertas do navegador (window.confirm / window.prompt).
 * Uso em qualquer lugar (sem hooks): `if (await confirmBox('Apagar?')) ...` e `const motivo = await promptBox({ ... })`.
 */
export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Ação destrutiva: botão de confirmar em vermelho. Sem isto, é deduzido do texto (excluir, apagar, remover, cancelar, lixeira). */
  danger?: boolean
}
export interface PromptOptions extends Omit<ConfirmOptions, 'danger'> {
  placeholder?: string
  initial?: string
  /** Não deixa confirmar com o campo vazio. */
  required?: boolean
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

let listener: ((p: Pending) => void) | null = null
const backlog: Pending[] = []
const push = (p: Pending) => { if (listener) listener(p); else backlog.push(p) }

const DANGER = /(exclu|apag|remov|cancel|lixeira|desfeit)/i
const norm = (o: string | ConfirmOptions): ConfirmOptions => (typeof o === 'string' ? { message: o } : o)

export function confirmBox(opts: string | ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', opts: norm(opts), resolve }))
}

/** Pede um texto. Devolve o texto digitado ou `null` se a pessoa cancelar. */
export function promptBox(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'prompt', opts, resolve }))
}

/** Confirma só quando `needed`; sem necessidade, segue direto (ex.: restaurar da lixeira não pergunta). */
export async function confirmIf(needed: boolean, opts: string | ConfirmOptions): Promise<boolean> {
  return needed ? confirmBox(opts) : true
}

/** Montado uma vez na raiz do app. */
export function DialogHost() {
  const [queue, setQueue] = useState<Pending[]>([])
  const [text, setText] = useState('')
  useEffect(() => {
    listener = (p) => setQueue((q) => [...q, p])
    if (backlog.length) setQueue((q) => [...q, ...backlog.splice(0)])
    return () => { listener = null }
  }, [])
  const cur = queue[0]
  useEffect(() => { if (cur?.kind === 'prompt') setText(cur.opts.initial ?? '') }, [cur])

  const finish = (ok: boolean) => {
    if (!cur) return
    if (cur.kind === 'confirm') cur.resolve(ok)
    else cur.resolve(ok ? text.trim() : null)
    setQueue((q) => q.slice(1))
  }
  if (!cur) return null
  const danger = cur.kind === 'confirm' && (cur.opts.danger ?? DANGER.test(cur.opts.message))
  const o = cur.opts
  const canOk = cur.kind === 'confirm' || !cur.opts.required || text.trim().length > 0
  const Icon = danger ? AlertTriangle : HelpCircle
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) finish(false) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            // Em ação destrutiva o foco inicial fica no Cancelar, para Enter não apagar sem querer.
            if (danger) { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-cancel]')?.focus() }
          }}
          className="fixed left-1/2 top-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="font-display text-xl font-bold">{o.title ?? (cur.kind === 'prompt' ? 'Informe' : danger ? 'Tem certeza?' : 'Confirmar')}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="whitespace-pre-line text-sm text-muted-foreground">{o.message}</DialogPrimitive.Description>
            </div>
          </div>
          {cur.kind === 'prompt' && (
            <form id="dialog-form" onSubmit={(e) => { e.preventDefault(); if (canOk) finish(true) }}>
              <Input aria-label={o.title ?? 'Texto'} autoFocus placeholder={cur.opts.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
            </form>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" data-cancel onClick={() => finish(false)}><X className="h-4 w-4" /> {o.cancelLabel ?? 'Cancelar'}</Button>
            <Button type={cur.kind === 'prompt' ? 'submit' : 'button'} form={cur.kind === 'prompt' ? 'dialog-form' : undefined}
              variant={danger ? 'destructive' : 'default'} disabled={!canOk} onClick={cur.kind === 'confirm' ? () => finish(true) : undefined}>
              <Check className="h-4 w-4" /> {o.confirmLabel ?? (danger ? 'Sim, continuar' : 'Confirmar')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
