import { toast } from 'sonner'
import { friendlyError } from './errors'

const UNDO_MS = 5000

/** Aviso de mudança com "Desfazer" por 5 s e uma barrinha que percorre a tarja até acabar o tempo. */
export function notifyChange(message: string, undo?: () => Promise<unknown> | unknown, opts: { onUndone?: () => void } = {}) {
  if (!undo) { toast.success(message); return }
  toast.custom((id) => (
    <div role="status" className="undo-card relative w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-semibold">{message}</span>
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-3 py-1 text-sm font-bold text-primary-foreground hover:opacity-90"
          onClick={async () => {
            toast.dismiss(id)
            try { await undo(); opts.onUndone?.(); toast.success('Desfeito.') } catch (e) { toast.error(friendlyError(e)) }
          }}
        >Desfazer</button>
      </div>
      <div className="h-1 w-full bg-muted"><div className="undo-bar h-full bg-primary" style={{ animationDuration: `${UNDO_MS}ms` }} /></div>
    </div>
  ), { duration: UNDO_MS, position: 'bottom-center' })
}

/** Aviso simples de "salvo", sem Desfazer: para telas de configuração, onde cada alteração já é confirmada com OK/Salvar. */
export function notifySaved(message: string, _undo?: unknown) {
  void _undo
  toast.success(message)
}
