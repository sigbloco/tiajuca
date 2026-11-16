import { useState } from 'react'
import { Button } from '@/components/ui/primitives'

export const PAGE_SIZE = 5

/** Mostra a lista de 5 em 5: `visible` são os itens à mostra e `more` revela mais 5. */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [count, setCount] = useState(size)
  return { visible: items.slice(0, count), hasMore: items.length > count, remaining: Math.max(0, items.length - count), more: () => setCount((c) => c + size), size }
}

export function ShowMore({ hasMore, remaining, size = PAGE_SIZE, onClick }: { hasMore: boolean; remaining: number; size?: number; onClick: () => void }) {
  if (!hasMore) return null
  return <Button type="button" variant="outline" className="w-full" onClick={onClick}>Ver mais {Math.min(size, remaining)}</Button>
}
