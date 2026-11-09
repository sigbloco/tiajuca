import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, type CatalogItem, type CatalogTable } from './service'

/** Lixeira: naipes e instrumentos movidos para cá (desativados). Dá para restaurar ou excluir de vez. */
export function TrashPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const secName = new Map((sections.data ?? []).map((s) => [s.id, s]))
  const trashedSections = (sections.data ?? []).filter((s) => !s.is_active)
  const trashedInstruments = (instruments.data ?? []).filter((i) => !i.is_active)

  const restore = useMutation({
    mutationFn: async (v: { table: CatalogTable; id: string }) => {
      const { error } = await supabase.from(v.table).update({ is_active: true }).eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Restaurado.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const purge = useMutation({
    mutationFn: async (v: { table: CatalogTable; id: string }) => {
      const { error } = await supabase.from(v.table).delete().eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Excluído de vez.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e))
      ? 'Não dá para excluir de vez: há itens dentro, pessoas, vagas ou músicas ligadas a ele. Deixe na Lixeira.' : friendlyError(e)),
  })
  const askPurge = (table: CatalogTable, item: CatalogItem) => {
    if (window.confirm(`Excluir “${item.name}” de vez? Isso não pode ser desfeito.`)) purge.mutate({ table, id: item.id })
  }

  const row = (table: CatalogTable, item: CatalogItem, detail?: string) => (
    <Card key={item.id} className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        {detail && <p className="truncate text-muted-foreground">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => restore.mutate({ table, id: item.id })}><RotateCcw className="h-4 w-4" /> Restaurar</Button>
        <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${item.name} de vez`} title="Excluir de vez" onClick={() => askPurge(table, item)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </Card>
  )

  const loading = sections.isLoading || instruments.isLoading
  const empty = trashedSections.length === 0 && trashedInstruments.length === 0
  return (
    <div className="space-y-4">
      <h1>Lixeira</h1>
      <p className="text-muted-foreground">Itens removidos ficam aqui até você restaurar ou excluir de vez.</p>
      {loading && <Skeleton className="h-24" />}
      {!loading && empty && <EmptyState>A lixeira está vazia.</EmptyState>}
      {trashedSections.length > 0 && (
        <section className="space-y-2">
          <h2>Naipes</h2>
          {trashedSections.map((s) => row('sections', s))}
        </section>
      )}
      {trashedInstruments.length > 0 && (
        <section className="space-y-2">
          <h2>Instrumentos</h2>
          {trashedInstruments.map((i) => {
            const sec = i.section_id ? secName.get(i.section_id) : undefined
            return row('instruments', i, sec ? `${sec.name}${sec.is_active ? '' : ' (naipe também na lixeira)'}` : undefined)
          })}
        </section>
      )}
    </div>
  )
}
