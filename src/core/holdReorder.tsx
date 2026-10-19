import { GripVertical } from 'lucide-react'
import { useSyncExternalStore } from 'react'

type DragState = { dragging: string | null; over: string | null }
// Estado compartilhado: a linha segurada e a linha-alvo podem estar em componentes diferentes.
let shared: DragState = { dragging: null, over: null }
const listeners = new Set<() => void>()
const setShared = (next: DragState) => { shared = next; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
let cleanupActive: (() => void) | null = null

const INTERACTIVE = 'input,textarea,select,button,a,[contenteditable="true"],[role="combobox"]'
const HOLD_ROW_MS = 350
const HOLD_HANDLE_MS = 120

/**
 * Reordenar arrastando: segure (mouse ou dedo) na alça ⠿ — ou numa área livre da linha — e arraste sobre outra linha do mesmo grupo.
 * Soltar move a linha para a posição da outra. As setas continuam funcionando. Perto das bordas da tela a página rola sozinha.
 */
export function useHoldReorder() {
  const state = useSyncExternalStore(subscribe, () => shared)
  const start = (e: React.PointerEvent, id: string, scope: string, viaHandle: boolean, onMove: (fromId: string, toId: string) => void) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!viaHandle && (e.target as HTMLElement).closest(INTERACTIVE)) return
    cleanupActive?.()
    const x0 = e.clientX, y0 = e.clientY
    let active = false
    let over: string | null = null
    let lastY = y0
    let raf = 0
    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-sortid]')
      return el && el.dataset.sortscope === scope ? el.dataset.sortid ?? null : null
    }
    const activate = () => {
      active = true
      document.body.style.userSelect = 'none'
      navigator.vibrate?.(15)
      setShared({ dragging: id, over: null })
      const tick = () => {
        if (!active) return
        if (lastY < 70) window.scrollBy(0, -12)
        else if (lastY > window.innerHeight - 70) window.scrollBy(0, 12)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const timer = setTimeout(activate, viaHandle ? HOLD_HANDLE_MS : HOLD_ROW_MS)
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) end(false)
        return
      }
      const t = targetAt(ev.clientX, ev.clientY)
      if (t !== over) { over = t; setShared({ dragging: id, over: t }) }
    }
    const block = (ev: TouchEvent) => { if (active) ev.preventDefault() }
    const up = () => end(true)
    const end = (commit: boolean) => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('touchmove', block)
      document.body.style.userSelect = ''
      cleanupActive = null
      const wasActive = active
      active = false
      setShared({ dragging: null, over: null })
      if (commit && wasActive && over && over !== id) onMove(id, over)
    }
    const cancel = () => end(false)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('touchmove', block, { passive: false })
    cleanupActive = () => end(false)
  }

  /** Atributos da linha; `scope` separa listas diferentes (uma linha só cai em linhas do mesmo escopo). */
  const row = (id: string, onMove: (fromId: string, toId: string) => void, scope = 'main') => ({
    'data-sortid': id,
    'data-sortscope': scope,
    onPointerDown: (e: React.PointerEvent) => start(e, id, scope, false, onMove),
    style: state.dragging ? ({ touchAction: 'auto' } as const) : undefined,
  })
  /** Classes de destaque: a linha segurada fica translúcida; a de destino ganha um contorno. */
  const cls = (id: string) => (state.dragging === id ? 'opacity-50 ring-2 ring-primary' : state.over === id ? 'ring-2 ring-secondary' : '')
  const handle = (id: string, onMove: (fromId: string, toId: string) => void, scope = 'main', label = 'Segure e arraste para mudar a ordem') => (
    <span role="img" aria-label={label} title={label} onPointerDown={(e) => { e.stopPropagation(); start(e, id, scope, true, onMove) }}
      className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing">
      <GripVertical className="h-5 w-5" aria-hidden />
    </span>
  )
  return { row, cls, handle, dragging: state.dragging }
}
