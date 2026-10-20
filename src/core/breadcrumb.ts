import { useEffect, useRef, useSyncExternalStore } from 'react'

export interface ExtraCrumb { id: symbol; title: string; close: () => void }
let stack: ExtraCrumb[] = []
const listeners = new Set<() => void>()
const emit = () => { stack = [...stack]; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Formulários abertos na página (painéis de edição) entram no caminho de navegação como último item. */
export function useExtraCrumbs(): ExtraCrumb[] {
  return useSyncExternalStore(subscribe, () => stack)
}

/** Registra um formulário aberto: `title` vira o último item do breadcrumb; `close` é chamado ao clicar no item anterior. */
export function useRegisterCrumb(title: string, close: () => void, enabled = true) {
  const id = useRef(Symbol('crumb')).current
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!enabled) return
    stack.push({ id, title, close: () => closeRef.current() })
    emit()
    return () => { stack = stack.filter((c) => c.id !== id); emit() }
  }, [title, enabled, id])
}
