import { useMemo, useState } from 'react'
import { SaveButton } from '@/components/shared/SaveButton'
import { StickySave } from '@/components/shared/StickySave'
import { UnsavedGuard } from '@/components/shared/UnsavedGuard'
import { Button, Card, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { useCategoryAccess, usePageReleaseRows, useSetReleases } from './pageReleaseData'
import { RELEASE_CATEGORIES, RELEASE_PAGES, columnChanges, pageAccessible, rawReleased, releasePage, rowKey, type ReleaseCategory, type ReleaseChange } from './pageReleases'

/**
 * Tabela de liberação das páginas: o mesmo dado das caixas do topo, de todas as páginas de uma vez.
 * As marcações ficam no rascunho até o Salvar fixo na base (as caixas do topo da página gravam na hora).
 * A liberação só restringe: a célula fica desmarcada e desabilitada quando a categoria não tem acesso à página em "Permissões dos papéis".
 * Desmarcar uma área apaga as subpáginas (herança); marcar a área não libera as subpáginas.
 */
export function PageReleasesTab() {
  const { realMembership } = useOrganization()
  const isTitular = !!realMembership?.roles.includes('titular')
  const rows = usePageReleaseRows()
  const access = useCategoryAccess()
  const set = useSetReleases()
  const [more, setMore] = useState(false)
  /** Rascunho: só o que difere do gravado. Chave `${página}|${categoria}`. */
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map())
  const ready = !!rows.data && !!access.data
  // Gravado + rascunho por cima.
  const map = useMemo(() => new Map([...(rows.data ?? new Map<string, boolean>()), ...draft]), [rows.data, draft])
  const dirty = isTitular && draft.size > 0

  const hasAccess = (page: string, cat: ReleaseCategory) => !access.data || pageAccessible(releasePage(page)!, access.data[cat])
  const hubOff = (page: string, cat: ReleaseCategory) => { const h = releasePage(page)?.hub; return !!h && !rawReleased(map, h, cat) }
  const editableColumn = (cat: ReleaseCategory) => (p: { key: string }) => hasAccess(p.key, cat)

  /** Aplica alterações ao rascunho; volta ao gravado quando o valor coincide (assim "sujo" só quando há diferença de verdade). */
  const stage = (changes: ReleaseChange[]) => setDraft((cur) => {
    const next = new Map(cur)
    for (const c of changes) {
      const k = rowKey(c.page, c.category)
      if (rawReleased(rows.data ?? new Map(), c.page, c.category) === c.released) next.delete(k)
      else next.set(k, c.released)
    }
    return next
  })
  const columnAll = (cat: ReleaseCategory) => {
    const cells = RELEASE_PAGES.filter(editableColumn(cat))
    const allOn = cells.length > 0 && cells.every((p) => rawReleased(map, p.key, cat))
    return { cells, allOn, toggle: () => stage(columnChanges(cat, !allOn, editableColumn(cat))) }
  }
  const closeAll = () => stage(RELEASE_CATEGORIES.filter((c) => c.key !== 'direcao').flatMap((c) => columnChanges(c.key, false, editableColumn(c.key))))

  const save = async () => {
    const changes: ReleaseChange[] = [...draft].map(([k, released]) => { const [page, category] = k.split('|'); return { page, category: category as ReleaseCategory, released } })
    await set.mutateAsync(changes)
    setDraft(new Map())
  }

  return (
    <div className="space-y-3">
      <UnsavedGuard dirty={dirty} onSave={save} />
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Quais páginas cada categoria pode abrir</p>
        <p className="text-sm text-muted-foreground">
          Marque o que quer liberar e salve. Só vale para quem já tem acesso em <strong>Permissões dos papéis</strong>; página não liberada fica apagada no menu.
        </p>
        {more && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Sem acesso em Permissões dos papéis, a caixa fica desmarcada e desabilitada.</li>
            <li>O Titular vê tudo.</li>
            <li>Desmarcar uma área (Oficina, Financeiro, Organização) apaga também as páginas dela. Marcar a área não libera as páginas: cada uma tem a sua caixa.</li>
            <li>Professor/Monitor não herda de Integrante ativo: marque a coluna dele.</li>
            <li>Colaborador segue a coluna Integrante ativo.</li>
          </ul>
        )}
        <button type="button" className="text-sm font-semibold text-primary hover:underline" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Ocultar' : 'Ler mais'}</button>
        {isTitular
          ? <Button variant="outline" className="h-auto min-h-10 w-full whitespace-normal py-2 text-center" disabled={!ready || set.isPending} onClick={closeAll}>Desmarcar tudo (todas as categorias, menos Direção)</Button>
          : <p className="text-sm text-muted-foreground">Só o Titular altera a liberação. Aqui você pode conferir.</p>}
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm md:min-w-[34rem]">
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left font-semibold md:min-w-[9.5rem] md:px-3">Página</th>
              {RELEASE_CATEGORIES.map((c) => {
                const col = columnAll(c.key)
                return (
                  <th key={c.key} scope="col" className="w-[3.25rem] px-0.5 py-2 text-center align-top font-semibold md:w-auto md:min-w-[5.5rem] md:px-1" title={c.label}>
                    <span className="block"><span className="hidden md:inline">{c.label}</span><span className="text-xs md:hidden">{c.short.split('/').map((part, i) => <span key={part}>{i > 0 && <>/<wbr /></>}{part}</span>)}</span></span>
                    {isTitular && (
                      // O rótulo não muda: ligado (destacado) = tudo marcado; clicar de novo desmarca tudo.
                      <button type="button" aria-pressed={col.allOn} disabled={!ready || set.isPending || col.cells.length === 0} onClick={col.toggle}
                        className={cn('mt-1 min-h-9 w-full rounded-md border px-1 py-0.5 text-xs font-semibold leading-tight disabled:opacity-50 md:w-auto md:whitespace-nowrap md:px-1.5',
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
                <th scope="row" className={cn('sticky left-0 z-10 break-words px-2 py-2 text-left md:px-3', p.isHub ? 'bg-muted font-bold' : 'bg-background font-normal', p.hub && 'pl-5 md:pl-7')}>{p.label}</th>
                {RELEASE_CATEGORIES.map((c) => {
                  const ok = hasAccess(p.key, c.key)
                  const off = hubOff(p.key, c.key)
                  const checked = ok && rawReleased(map, p.key, c.key)
                  const disabled = !isTitular || !ready || !ok || off || set.isPending
                  const changed = draft.has(rowKey(p.key, c.key))
                  const why = !ok ? `${c.label} não tem acesso a esta página em Permissões dos papéis.` : off ? `Libere primeiro a área ${releasePage(p.hub!)?.label} para ${c.label}.` : undefined
                  return (
                    <td key={c.key} className={cn('px-0.5 py-2 text-center md:px-1', changed && 'bg-warning/20')} title={why}>
                      <input type="checkbox" className="h-5 w-5 align-middle" aria-label={`${p.label} para ${c.label}`} checked={checked} disabled={disabled}
                        onChange={(e) => stage([{ page: p.key, category: c.key, released: e.target.checked }])} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isTitular && (
        <StickySave>
          <div className="flex gap-2">
            {dirty && <Button variant="outline" disabled={set.isPending} onClick={() => setDraft(new Map())}>Descartar</Button>}
            <SaveButton className="w-full" disabled={!dirty || set.isPending} onClick={() => void save()} hint="Salvar liberação" />
          </div>
        </StickySave>
      )}
    </div>
  )
}
