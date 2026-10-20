import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { OkSelect } from '@/components/shared/ConfirmField'
import { Button, Card, Input, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { useCatalog } from './CatalogEditor'
import { ITEM_LABELS, invalidateCatalog, saveCatalogItem } from './service'
import { ItemRow, byOrder, nextOrder, useStructureMutations } from './StructureManagers'

/** Naipes → Configurações: os nomes que “Novo naipe” oferece, cada um com a afinação (altura definida/indefinida) e o tipo de item (instrumento, atividade, voz). */
export function SectionNamesPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const names = useCatalog('section_names')
  const mut = useStructureMutations('section_names')
  const [form, setForm] = useState({ name: '', tuned: 'yes', label: 'Instrumento' })
  const list = (names.data ?? []).slice().sort(byOrder)
  const add = useMutation({
    mutationFn: () => saveCatalogItem('section_names', orgId, { name: form.name.trim(), has_tuning: form.tuned === 'yes', item_label: form.label, sort_order: nextOrder(names.data ?? []) }),
    onSuccess: () => { setForm({ name: '', tuned: 'yes', label: 'Instrumento' }); invalidateCatalog(qc, orgId); toast.success('Nome criado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      <h2>Nomes de naipes</h2>
      <p className="text-muted-foreground">
        Os nomes que “Novo naipe” oferece. Cada um define se os itens têm afinação (altura definida) ou não (altura indefinida) e como se chamam: instrumento, atividade ou voz.
        O naipe criado herda essas escolhas.
      </p>
      {canEdit && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <Input className="min-w-40 flex-1" aria-label="Novo nome de naipe" placeholder="Novo nome de naipe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select className="w-44" aria-label="Altura" value={form.tuned} onChange={(e) => setForm({ ...form, tuned: e.target.value })}>
            <option value="yes">Altura definida</option><option value="no">Altura indefinida</option>
          </Select>
          <Select className="w-36" aria-label="Tipo de item" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}>
            {ITEM_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
          <Button disabled={!form.name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      <div className="grid gap-1.5">
        {list.map((n) => (
          <ItemRow key={n.id} item={n} siblings={list} canEdit={canEdit} mut={mut}
            extra={(
              <>
                <OkSelect className="h-9 w-44" aria-label={`Altura de ${n.name}`} disabled={!canEdit} value={n.has_tuning === false ? 'no' : 'yes'}
                  onSave={(v) => mut.save.mutateAsync({ id: n.id, name: n.name, has_tuning: v === 'yes' })}>
                  <option value="yes">Altura definida</option><option value="no">Altura indefinida</option>
                </OkSelect>
                <OkSelect className="h-9 w-32" aria-label={`Tipo de item de ${n.name}`} disabled={!canEdit} value={n.item_label ?? 'Instrumento'}
                  onSave={(v) => mut.save.mutateAsync({ id: n.id, name: n.name, item_label: v })}>
                  {ITEM_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </OkSelect>
              </>
            )} />
        ))}
      </div>
    </div>
  )
}
