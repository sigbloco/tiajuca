import { useEffect, useRef, useSyncExternalStore } from 'react'

type Entry = { save: () => Promise<unknown> | unknown }
const entries = new Map<symbol, Entry>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => { version++; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Registra que esta tela/campo tem alteração pendente. `save` é chamado se a pessoa escolher "Salvar" ao tentar sair. */
export function useUnsaved(dirty: boolean, save: () => Promise<unknown> | unknown) {
  const id = useRef(Symbol('unsaved')).current
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (!dirty) return
    entries.set(id, { save: () => saveRef.current() })
    emit()
    return () => { entries.delete(id); emit() }
  }, [dirty, id])
}

/** Quantas alterações pendentes existem agora (para o aviso de saída). */
export function useUnsavedCount() {
  useSyncExternalStore(subscribe, () => version)
  return entries.size
}

/** Salva todas as pendências, uma a uma. Lança erro se alguma falhar (e a saída fica bloqueada). */
export async function saveAllUnsaved() {
  for (const e of [...entries.values()]) await e.save()
}
