import { useState } from 'react'
import { confirmBox } from '@/components/shared/DialogHost'
import { Button, Card, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { useCategoryAccess, usePageReleaseRows, useSetReleases } from './releaseData'
import { RELEASE_CATEGORIES, RELEASE_PAGES, columnChanges, pageAccessible, rawReleased, releasePage, type ReleaseCategory, type ReleaseChange } from './releases'

/**
 * Tabela de liberação das páginas: o mesmo dado das caixas do topo, de todas as páginas de uma vez.
 * A liberação só restringe: a célula fica desmarcada e desabilitada quando a categoria não tem acesso à página em "Permissões dos papéis".
 * Desmarcar uma área apaga as subpáginas (herança); marcar a área não libera as subpáginas.
 */
export function ReleasesTab() {
  const { realMembership } = useOrganization()
  const isTitular = !!realMembership?.roles.includes('titular')
  const rows = usePageReleaseRows()
  const access = useCategoryAccess()
  const set = useSetReleases()
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const map = rows.data ?? new Map()
  const ready = !!rows.data && !!access.data

  const hasAccess = (page: string, cat: ReleaseCategory) => !access.data || pageAccessible(releasePage(page)!, access.data[cat])
  const hubOff = (page: string, cat: ReleaseCategory) => { const h = releasePage(page)?.hub; return !!h && !rawReleased(map, h, cat) }
  const editableColumn = (cat: ReleaseCategory) => (p: { key: string }) => hasAccess(p.key, cat)

  const apply = async (changes: ReleaseChange[]) => { setBusy(true); try { await set.mutateAsync(changes) } finally { setBusy(false) } }
  const columnAll = (cat: ReleaseCategory) => {
    const cells = RELEASE_PAGES.filter(editableColumn(cat))
    const allOn = cells.length > 0 && cells.every((p) => rawReleased(map, p.key, cat))
    return { cells, allOn, toggle: () => apply(columnChanges(cat, !allOn, editableColumn(cat))) }
  }
  const closeAll = async () => {
    if (!(await confirmBox('Desmarcar todas as páginas de Professor, Monitor, Integrante ativo e Integrante inativo? Essas pessoas ficam sem nenhuma página liberada. A Direção não muda.'))) return
    await apply(RELEASE_CATEGORIES.filter((c) => c.key !== 'direcao').flatMap((c) => columnChanges(c.key, false, editableColumn(c.key))))
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Quais páginas cada categoria pode abrir</p>
        <p className="text-sm text-muted-foreground">
          Marque o que quer liberar. Só vale para quem já tem acesso em <strong>Permissões dos papéis</strong>; página não liberada fica apagada no menu.
        </p>
        {more && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Sem acesso em Permissões dos papéis, a caixa fica desmarcada e desabilitada.</li>
            <li>O Titular vê tudo.</li>
            <li>Desmarcar uma área (Oficina, Financeiro, Organização) apaga também as páginas dela. Marcar a área não libera as páginas: cada uma tem a sua caixa.</li>
            <li>Professor e Monitor não herdam de Integrante ativo: marque cada coluna.</li>
          </ul>
        )}
        <button type="button" className="text-sm font-semibold text-primary hover:underline" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Ocultar' : 'Ler mais'}</button>
        {isTitular
          ? <Button variant="outline" className="w-full" disabled={!ready || busy} onClick={() => void closeAll()}>Desmarcar tudo (todas as categorias, menos Direção)</Button>
          : <p className="text-sm text-muted-foreground">Só o Titular altera a liberação. Aqui você pode conferir.</p>}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="sticky left-0 z-10 min-w-[9.5rem] bg-muted px-3 py-2 text-left font-semibold">Página</th>
              {RELEASE_CATEGORIES.map((c) => {
                const col = columnAll(c.key)
                return (
                  <th key={c.key} scope="col" className="min-w-[5.5rem] px-1 py-2 text-center font-semibold" title={c.label}>
                    <span className="block"><span className="hidden md:inline">{c.label}</span><span className="md:hidden">{c.short}</span></span>
                    {isTitular && (
                      // O rótulo não muda: ligado (destacado) = tudo marcado; clicar de novo desmarca tudo.
                      <button type="button" aria-pressed={col.allOn} disabled={!ready || busy || col.cells.length === 0} onClick={() => void col.toggle()}
                        className={cn('mt-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold disabled:opacity-50',
                          col.allOn ? 'border-primary bg-primary text-primary-foreground hover:bg-primary' : 'border-border bg-card hover:bg-muted')}>
                        Marcar tudo
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {RELEASE_PAGES.map((p) => (
              <tr key={p.key} className={cn('border-t border-border', p.isHub && 'bg-muted/40')}>
                <th scope="row" className={cn('sticky left-0 z-10 px-3 py-2 text-left', p.isHub ? 'bg-muted font-bold' : 'bg-background font-normal', p.hub && 'pl-7')}>{p.label}</th>
                {RELEASE_CATEGORIES.map((c) => {
                  const ok = hasAccess(p.key, c.key)
                  const off = hubOff(p.key, c.key)
                  const checked = ok && rawReleased(map, p.key, c.key)
                  const disabled = !isTitular || !ready || !ok || off || busy
                  const why = !ok ? `${c.label} não tem acesso a esta página em Permissões dos papéis.` : off ? `Libere primeiro a área ${releasePage(p.hub!)?.label} para ${c.label}.` : undefined
                  return (
                    <td key={c.key} className="px-1 py-2 text-center" title={why}>
                      <input type="checkbox" className="h-5 w-5 align-middle" aria-label={`${p.label} para ${c.label}`} checked={checked} disabled={disabled}
                        onChange={(e) => void apply([{ page: p.key, category: c.key, released: e.target.checked }])} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
