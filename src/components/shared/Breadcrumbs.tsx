import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useExtraCrumbs } from '@/core/breadcrumb'

export interface Crumb { label: string; to?: string; /** Mostra o caminho mesmo sendo um item só (página sem título próprio). */ solo?: boolean }
type Item = Crumb & { close?: () => void }

/**
 * Caminho de navegação no lugar dos "Voltar": Organização • Naipes e instrumentos • Novo naipe.
 * Os itens com link levam à página; quando há um formulário aberto, o item da página fecha o formulário.
 * Se o caminho passar de duas linhas, o primeiro item e os dois últimos ficam à vista e os do meio vão para o menu "•••".
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const extra = useExtraCrumbs()
  const navRef = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [open, setOpen] = useState(false)
  const width = useRef(0)
  const all: Item[] = [...crumbs]
  // Cada item que tem outro dentro dele fica clicável: clicar fecha o nível seguinte (aba ou painel de edição).
  for (const e of extra) {
    if (all.length > 0) all[all.length - 1] = { ...all[all.length - 1], close: e.close }
    all.push({ label: e.title })
  }
  const key = all.map((c) => c.label).join('|')
  const canCollapse = all.length > 3

  // Caminho novo: volta a tentar mostrar inteiro.
  useEffect(() => { setCollapsed(false); setOpen(false) }, [key])
  // Mudou a largura (girar o celular, redimensionar): tenta mostrar inteiro de novo.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(() => { if (Math.abs(nav.clientWidth - width.current) > 1) { width.current = nav.clientWidth; setCollapsed(false) } })
    ro.observe(nav)
    return () => ro.disconnect()
  }, [])
  // Fecha o menu ao clicar fora.
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!navRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    // Passou de duas linhas: junta os itens do meio no menu.
    const lh = Math.max((nav.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0, parseFloat(getComputedStyle(nav).lineHeight) || 0, 18)
    if (canCollapse && !collapsed && lh > 0 && nav.offsetHeight > lh * 2 + 12) { setCollapsed(true); return }
    // Se o caminho quebrar de linha, esconde o "•" que ficaria sozinho no fim da linha (o item seguinte foi para a de baixo).
    nav.querySelectorAll<HTMLElement>('[data-bullet]').forEach((b) => {
      const next = b.nextElementSibling as HTMLElement | null
      b.style.visibility = next && next.offsetTop > b.offsetTop + 2 ? 'hidden' : 'visible'
    })
  })
  if (crumbs.length === 0 && extra.length === 0) return null
  if (all.length <= 1 && !all[0]?.solo) return null

  const hidden = collapsed && canCollapse ? all.slice(1, all.length - 2) : []
  const shown = all.map((c, i) => ({ c, i })).filter(({ i }) => !(hidden.length && i >= 1 && i <= all.length - 3))
  const cls = 'font-semibold text-primary hover:underline'
  const link = (c: Item, onDone?: () => void) => c.close ? <button type="button" onClick={() => { c.close!(); onDone?.() }} className={`${cls} text-left`}>{c.label}</button>
    : c.to ? <Link to={c.to} onClick={onDone} className={cls}>{c.label}</Link>
    : <span className="font-semibold">{c.label}</span>

  return (
    <nav ref={navRef} aria-label="Você está em" className="relative mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {shown.map(({ c, i }, n) => {
        const last = i === all.length - 1
        return (
          <Fragment key={`${c.label}-${i}`}>
            {n > 0 && <span aria-hidden data-bullet className="text-muted-foreground">•</span>}
            {hidden.length > 0 && i === all.length - 2 && (
              <>
                <button type="button" aria-label="Mostrar o caminho completo" aria-expanded={open} onClick={() => setOpen((o) => !o)}
                  className="inline-flex h-6 items-center rounded-md border border-border px-1.5 text-primary hover:bg-primary/10"><MoreHorizontal className="h-4 w-4" aria-hidden /></button>
                <span aria-hidden data-bullet className="text-muted-foreground">•</span>
              </>
            )}
            {last ? <span aria-current="page" className="font-semibold">{c.label}</span> : link(c)}
          </Fragment>
        )
      })}
      {open && hidden.length > 0 && (
        <ul className="absolute left-0 top-full z-30 mt-1 w-full max-w-sm space-y-1 rounded-xl border border-border bg-card p-3 shadow-lg">
          {hidden.map((c, i) => <li key={`${c.label}-${i}`}>{link(c, () => setOpen(false))}</li>)}
        </ul>
      )}
    </nav>
  )
}
