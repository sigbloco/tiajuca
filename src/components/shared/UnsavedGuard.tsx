import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'
import { saveAllUnsaved, useUnsaved, useUnsavedCount } from '@/core/unsaved'

/** Declara que a tela tem alterações não salvas. O aviso de saída é um só, global (veja `GlobalUnsavedGuard`). */
export function UnsavedGuard({ dirty, onSave }: { dirty: boolean; onSave: () => Promise<unknown> | unknown }) {
  useUnsaved(dirty, onSave)
  return null
}

/**
 * Regra geral do site: se há alteração não salva (em qualquer tela ou campo) e a pessoa tenta sair da página,
 * pergunta se quer salvar. Fica uma vez só, dentro do AppShell.
 */
export function GlobalUnsavedGuard() {
  const count = useUnsavedCount()
  const dirty = count > 0
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (blocker.state !== 'blocked') return null
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) blocker.reset() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl bg-card p-6 shadow-xl">
          <div>
            <Dialog.Title className="font-display text-xl font-bold">Salvar as alterações?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">Você mudou algo nesta página e ainda não salvou.</Dialog.Description>
          </div>
          <div className="flex flex-col gap-2">
            <Button disabled={saving} onClick={async () => {
              setSaving(true)
              try { await saveAllUnsaved(); blocker.proceed() } catch { blocker.reset() } finally { setSaving(false) }
            }}>{saving ? 'Salvando…' : 'Salvar e sair'}</Button>
            <Button variant="outline" onClick={() => blocker.proceed()}>Sair sem salvar</Button>
            <Button variant="ghost" onClick={() => blocker.reset()}>Continuar editando</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
