import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Collapsible } from '@/components/shared/Collapsible'
import { confirmBox, promptBox } from '@/components/shared/DialogHost'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { FormSettingsTabs } from './FormSettingsTabs'
import { FIELD_TYPE_LABEL, MAPPING_LABEL, type FieldType } from './types'

export interface SectionTemplate {
  id: string; name: string; updated_at: string
  section: { label: string; description: string | null }
  fields: { label: string; field_type: FieldType; required: boolean; member_mapping: string | null; validation?: { social?: boolean } }[]
}

export function useSectionTemplates() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-templates', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_section_templates').select('id, name, updated_at, section, fields').eq('organization_id', orgId).order('name')
      if (error) throw error
      return (data ?? []) as SectionTemplate[]
    },
  })
}

/** Formulários → Configurações → Seções modelo: seções prontas (com perguntas e ligações com o cadastro) para inserir em qualquer formulário. */
export function SectionTemplatesPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data, isLoading } = useSectionTemplates()
  const [opened, setOpened] = useState<Set<string>>(new Set()) // começam recolhidos
  const refresh = () => qc.invalidateQueries({ queryKey: ['form-templates', orgId] })
  const rename = useMutation({
    mutationFn: async (v: { id: string; name: string }) => { const { error } = await supabase.from('form_section_templates').update({ name: v.name }).eq('id', v.id); if (error) throw error },
    onSuccess: () => { toast.success('Modelo renomeado.'); refresh() },
    onError: (e) => toast.error(/23505|duplicate/i.test(JSON.stringify(e)) ? 'Já existe um modelo com esse nome.' : friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('form_section_templates').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { toast.success('Modelo apagado. Os formulários que já o usaram não mudam.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = (id: string) => setOpened((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <p className="text-muted-foreground">
        Seções prontas para reaproveitar. No editor de qualquer formulário, “Seção modelo” insere uma cópia no fim; mudar o modelo depois não altera formulários que já o usaram.
        Para criar ou atualizar um modelo, abra uma seção no editor e use “Salvar como modelo” (com o mesmo nome, ele é atualizado).
      </p>
      {isLoading && <Skeleton className="h-24" />}
      {data?.length === 0 && <EmptyState>Nenhum modelo ainda. No editor de um formulário, use “Salvar como modelo” em uma seção.</EmptyState>}
      <div className="space-y-2">
        <ProgressiveList items={data ?? []} render={(t) => (
          <Collapsible key={t.id} open={opened.has(t.id)} onToggle={() => toggle(t.id)} title={t.name} count={t.fields.length}
            right={(
              <span className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${t.name}`} title="Renomear"
                  onClick={async () => { const n = await promptBox({ title: 'Renomear modelo', message: 'Nome do modelo:', initial: t.name, confirmLabel: 'Salvar' }); if (n && n.trim() && n.trim() !== t.name) rename.mutate({ id: t.id, name: n.trim() }) }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Apagar ${t.name}`} title="Apagar"
                  onClick={async () => { if (await confirmBox(`Apagar o modelo “${t.name}”? Os formulários que já o usaram não mudam.`)) remove.mutate(t.id) }}><Trash2 className="h-4 w-4" /></Button>
              </span>
            )}>
            <div className="space-y-2 p-1">
              <p className="text-sm"><span className="font-semibold">Título da seção:</span> {t.section.label}</p>
              {t.fields.length === 0 && <p className="text-sm text-muted-foreground">Sem perguntas.</p>}
              <ul className="space-y-1.5">
                {t.fields.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-semibold">{f.label}{f.required && <span className="text-destructive"> *</span>}</span>
                    <Badge>{f.validation?.social ? 'Redes sociais' : FIELD_TYPE_LABEL[f.field_type]}</Badge>
                    {f.member_mapping && <Badge className="bg-primary/10 text-primary">{MAPPING_LABEL[f.member_mapping] ?? f.member_mapping}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          </Collapsible>
        )} />
      </div>
    </div>
  )
}
