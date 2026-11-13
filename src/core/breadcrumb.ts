import { useEffect, useRef, useSyncExternalStore } from 'react'

export interface ExtraCrumb { id: symbol; title: string; close: () => void; level: number }
let stack: ExtraCrumb[] = []
const listeners = new Set<() => void>()
const emit = () => { stack = [...stack]; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Formulários abertos na página (painéis de edição) entram no caminho de navegação como último item. */
export function useExtraCrumbs(): ExtraCrumb[] {
  return useSyncExternalStore(subscribe, () => stack)
}

/** Registra um formulário aberto: `title` vira o último item do breadcrumb; `close` é chamado ao clicar no item anterior. */
export function useRegisterCrumb(title: string, close: () => void, enabled = true, level = 1) {
  const id = useRef(Symbol('crumb')).current
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!enabled) return
    stack.push({ id, title, level, close: () => closeRef.current() })
    stack.sort((a, b) => a.level - b.level) // estável: abas da página (0) antes dos painéis de edição (1)
    emit()
    return () => { stack = stack.filter((c) => c.id !== id); emit() }
  }, [title, enabled, id])
}
