import { useState } from 'react'

/** Como useState, mas lembra o valor na sessão: ao voltar para a página, a aba em que a pessoa estava continua aberta. */
export function useRememberedState<T extends string>(key: string, initial: T, valid?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem('remembered:' + key) as T | null
      if (saved && (!valid || valid.includes(saved))) return saved
    } catch { /* sem armazenamento: usa o valor inicial */ }
    return initial
  })
  const set = (v: T) => {
    setValue(v)
    try { sessionStorage.setItem('remembered:' + key, v) } catch { /* ignorar */ }
  }
  return [value, set] as const
}
