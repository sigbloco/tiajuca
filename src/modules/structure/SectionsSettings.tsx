import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card, Input, Button } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from './CatalogEditor'
import { Actions } from './NaipesPage'
import { NewSectionWizard } from './NewSectionWizard'
import { invalidateCatalog, type CatalogItem } from './service'
import { byOrder, useStructureMutations } from './StructureManagers'

/** Configurações gerais → Naipes: os naipes são predefinidos; só aqui dá para criar outros, renomear, reordenar, desativar ou excluir. */
export function SectionsSettings() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const mut = useStructureMutations('sections')
  const drag = useHoldReorder()
  const [renaming, setRenaming] = useState<string | null>(null)
  const ordered = (sections.data ?? []).slice().sort(byOrder)
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sections').delete().eq('id', id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Naipe excluído.'); invalidateCatalog(qc, orgId) },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e)) ? 'Não dá para excluir: o naipe tem subnaipes, instrumentos ou pessoas ligadas. Desative em vez de excluir.' : friendlyError(e)),
  })
  const onMove = (f: string, t: string) => mut.reorder.mutate({ from: f, to: t, list: ordered })

  return (
    <div className="space-y-3">
      <h2>Naipes</h2>
      <p className="text-muted-foreground">Os naipes do bloco são predefinidos: Sopro, Cordas, Percussão, Performance e Canto. Aqui você cria outros, renomeia, reordena, desativa ou exclui. Subnaipes, instrumentos e equipe de cada naipe ficam em Organização → Naipes.</p>
      {canEdit && <NewSectionWizard />}
      <div className="grid gap-2">
        {ordered.map((s: CatalogItem, idx) => (
          <Card key={s.id} {...(canEdit ? drag.row(s.id, onMove, 'sections') : {})} className={`space-y-2 p-2 ${drag.cls(s.id)} ${s.is_active ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate pl-2 font-display text-lg font-bold">{s.name}</span>
              {canEdit && (
                <Actions item={s} label="naipe" idx={idx} total={ordered.length} handle={drag.handle(s.id, onMove, 'sections')}
                  onUp={() => mut.move.mutate({ a: s, b: ordered[idx - 1], list: ordered })} onDown={() => mut.move.mutate({ a: s, b: ordered[idx + 1], list: ordered })}
                  onEdit={() => setRenaming(renaming === s.id ? null : s.id)}
                  onToggle={() => mut.save.mutate({ id: s.id, name: s.name, is_active: !s.is_active })}
                  onDelete={() => { if (window.confirm(`Excluir o naipe “${s.name}”? Isso não pode ser desfeito. Se já foi usado, prefira desativar.`)) del.mutate(s.id) }} />
              )}
            </div>
            {renaming === s.id && (
              <form className="flex gap-2" onSubmit={(e) => {
                e.preventDefault()
                const v = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                if (v && v !== s.name) mut.save.mutate({ id: s.id, name: v })
                setRenaming(null)
              }}>
                <Input name="name" aria-label="Novo nome do naipe" defaultValue={s.name} autoFocus />
                <Button type="submit" size="sm">Salvar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancelar</Button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
