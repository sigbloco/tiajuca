import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ReadMore } from '@/components/shared/ReadMore'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { OkSelect, SaveInput } from '@/components/shared/ConfirmField'
import { Button, Card, Input, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { useCatalog } from './CatalogEditor'
import { PITCH_LABEL, invalidateCatalog, saveCatalogItem, type PitchMode } from './service'
import { ItemRow, byOrder, nextOrder, useStructureMutations } from './StructureManagers'

/** Naipes → Configurações: os nomes que “Novo naipe” oferece, cada um com a afinação (altura definida/indefinida) e o tipo de item (instrumento, atividade, voz). */
export function SectionNamesPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const names = useCatalog('section_names')
  const mut = useStructureMutations('section_names')
  const [form, setForm] = useState<{ name: string; pitch: PitchMode; label: string }>({ name: '', pitch: 'defined', label: 'Instrumento' })
  const list = (names.data ?? []).slice().sort(byOrder)
  const add = useMutation({
    mutationFn: () => saveCatalogItem('section_names', orgId, { name: form.name.trim(), has_tuning: form.pitch === 'defined', pitch_mode: form.pitch, item_label: form.label.trim() || 'Instrumento', sort_order: nextOrder(names.data ?? []) }),
    onSuccess: () => { setForm({ name: '', pitch: 'defined', label: 'Instrumento' }); invalidateCatalog(qc, orgId); toast.success('Nome criado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-3">
      <h2>Nomes de naipes</h2>
      <ReadMore>
        Os nomes que “Novo naipe” oferece. Cada um define a altura dos itens (definida, indefinida ou não se aplica) e como eles se chamam (instrumento, atividade, voz).
        O tipo de item é um texto livre. O naipe criado herda essas escolhas.
      </ReadMore>
      {canEdit && (
        <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Input className="sm:min-w-40 sm:flex-1" aria-label="Novo nome de naipe" placeholder="Novo nome de naipe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select className="w-full sm:w-44" aria-label="Altura" value={form.pitch} onChange={(e) => setForm({ ...form, pitch: e.target.value as PitchMode })}>
            {(Object.keys(PITCH_LABEL) as PitchMode[]).map((k) => <option key={k} value={k}>{PITCH_LABEL[k]}</option>)}
          </Select>
          <Input className="w-full sm:w-40" aria-label="Tipo de item" placeholder="Tipo de item" maxLength={30} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Button disabled={!form.name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      <div className="grid gap-1.5">
        <ProgressiveList items={list} render={(n, k) => (
          <ItemRow key={n.id} zebra={k % 2 === 1} item={n} siblings={list} canEdit={canEdit} mut={mut}
            extra={(
              <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row">
                <OkSelect className="h-9 w-full sm:w-44" aria-label={`Altura de ${n.name}`} disabled={!canEdit} value={n.pitch_mode ?? (n.has_tuning === false ? 'undefined' : 'defined')}
                  onSave={(v) => mut.save.mutateAsync({ id: n.id, name: n.name, pitch_mode: v as PitchMode, has_tuning: v === 'defined' })}>
                  {(Object.keys(PITCH_LABEL) as PitchMode[]).map((k) => <option key={k} value={k}>{PITCH_LABEL[k]}</option>)}
                </OkSelect>
                <SaveInput className="w-full sm:w-40 sm:flex-none" aria-label={`Tipo de item de ${n.name}`} placeholder="Tipo de item" value={n.item_label ?? 'Instrumento'}
                  onSave={(v) => mut.save.mutateAsync({ id: n.id, name: n.name, item_label: v })} />
              </div>
            )} />
        )} />
      </div>
    </div>
  )
}
