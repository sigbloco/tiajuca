import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useExtraCrumbs } from '@/core/breadcrumb'

export interface Crumb { label: string; to?: string }

/**
 * Caminho de navegação no lugar dos "Voltar": Organização • Naipes e instrumentos • Novo naipe.
 * Os itens com link levam à página; quando há um formulário aberto, o item da página fecha o formulário.
 */
export function Breadcrumbs({ crumbs, home }: { crumbs: Crumb[]; home: string }) {
  const extra = useExtraCrumbs()
  if (crumbs.length === 0 && extra.length === 0) return null
  const all: (Crumb & { close?: () => void })[] = [...crumbs]
  if (extra.length > 0 && all.length > 0) {
    const last = all[all.length - 1]
    all[all.length - 1] = { ...last, close: extra[0].close }
  }
  for (const e of extra) all.push({ label: e.title })
  return (
    <nav aria-label="Você está em" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Link to={home} className="font-semibold text-primary hover:underline">Início</Link>
      {all.map((c, i) => {
        const last = i === all.length - 1
        return (
          <Fragment key={`${c.label}-${i}`}>
            <span aria-hidden className="text-muted-foreground">•</span>
            {last ? <span aria-current="page" className="font-semibold">{c.label}</span>
              : c.close ? <button type="button" onClick={c.close} className="font-semibold text-primary hover:underline">{c.label}</button>
              : c.to ? <Link to={c.to} className="font-semibold text-primary hover:underline">{c.label}</Link>
              : <span className="font-semibold">{c.label}</span>}
          </Fragment>
        )
      })}
    </nav>
  )
}
