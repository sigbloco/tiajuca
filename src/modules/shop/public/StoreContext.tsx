import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/core/auth'
import { supabase } from '@/core/supabase'
import type { OrgTheme } from '@/core/theme'
import type { ContactInfo, PixInfo } from '../payments/pix'
import { addToCart, indexCatalog, priceCart, reconcileCart, removeLine, setQuantity, type CartLine, type CatalogIndex, type PricedCart, type StoreProduct } from '../cart'

export interface PickupPointPublic { id: string; name: string; address: string; opening_hours: string }
export interface StoreData {
  org: { id: string; name: string; short_name: string; slug: string; logo_path: string | null; theme: OrgTheme }
  payment_methods: string[]
  pix: PixInfo | null
  contact: ContactInfo
  products: StoreProduct[]
  pickup_points: PickupPointPublic[]
}

interface StoreContextValue {
  store: StoreData
  index: CatalogIndex
  isMember: boolean
  cart: PricedCart
  notices: string[]
  dismissNotices: () => void
  add: (variantId: string, qty: number) => void
  setQty: (variantId: string, qty: number) => void
  remove: (variantId: string) => void
  clear: () => void
  basePath: string
  loginOpen: boolean
  setLoginOpen: (open: boolean) => void
}

const Ctx = createContext<StoreContextValue | null>(null)
export const useStore = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore fora do StoreProvider')
  return v
}

export async function fetchStore(slug: string): Promise<StoreData | null> {
  const { data, error } = await supabase.rpc('shop_get_public_store', { p_slug: slug })
  if (error) throw error
  return (data as StoreData | null) ?? null
}

const cartKey = (slug: string) => `shop:cart:${slug}`
function readCart(slug: string): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey(slug)) ?? '[]') as unknown
    return Array.isArray(raw)
      ? raw.filter((l): l is CartLine => typeof l?.variantId === 'string' && Number.isInteger(l?.quantity) && l.quantity > 0)
      : []
  } catch { return [] }
}
function writeCart(slug: string, lines: CartLine[]) {
  try { localStorage.setItem(cartKey(slug), JSON.stringify(lines)) } catch { /* armazenamento indisponível: o carrinho vale só nesta aba */ }
}

export function StoreProvider({ store, basePath, children }: { store: StoreData; basePath: string; children: ReactNode }) {
  const slug = store.org.slug
  const { session, loading: authLoading } = useAuth()
  const index = useMemo(() => indexCatalog(store.products), [store.products])
  const [lines, setLines] = useState<CartLine[]>(() => readCart(slug))
  const [notices, setNotices] = useState<string[]>([])
  const [loginOpen, setLoginOpen] = useState(false)

  // Integrante ATIVO logado? (o servidor volta a conferir isso no checkout; aqui só decide o que exibir)
  const member = useQuery({
    queryKey: ['shop', 'my-member', store.org.id, session?.user.id],
    enabled: !authLoading && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('shop_my_member_id', { p_org: store.org.id })
      if (error) throw error
      return (data as string | null) ?? null
    },
  })
  const isMember = !!session && !!member.data

  // Confere o carrinho guardado contra o catálogo atual (item sumiu, esgotou, passou do estoque).
  useEffect(() => {
    const r = reconcileCart(readCart(slug), index)
    setLines(r.lines)
    writeCart(slug, r.lines)
    if (r.notices.length) setNotices(r.notices)
  }, [slug, index])

  const update = useCallback((fn: (l: CartLine[]) => CartLine[]) => {
    setLines((prev) => { const next = fn(prev); writeCart(slug, next); return next })
  }, [slug])

  const value = useMemo<StoreContextValue>(() => ({
    store, index, isMember, basePath, notices, loginOpen, setLoginOpen,
    cart: priceCart(lines, index, isMember),
    dismissNotices: () => setNotices([]),
    add: (id, qty) => update((l) => addToCart(l, id, qty, index)),
    setQty: (id, qty) => update((l) => setQuantity(l, id, qty, index)),
    remove: (id) => update((l) => removeLine(l, id)),
    clear: () => update(() => []),
  }), [store, index, isMember, basePath, notices, loginOpen, lines, update])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
