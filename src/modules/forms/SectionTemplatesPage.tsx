import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { confirmBox, promptBox } from '@/components/shared/DialogHost'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { FormSettingsTabs } from './FormSettingsTabs'

/** Modelo de seção: uma seção com suas perguntas, guardada num formulário interno (`form_id`) editado com o mesmo editor dos formulários. */
export interface SectionTemplate { id: string; name: string; form_id: string; section_id: string; count: number }

export function useSectionTemplates() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-templates', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_section_templates').select('id, name, form_id, section_id').eq('organization_id', orgId).order('name')
      if (error) throw error
      const list = (data ?? []) as Omit<SectionTemplate, 'count'>[]
      const counts = new Map<string, number>()
      if (list.length > 0) {
        const { data: rows, error: e2 } = await supabase.from('form_fields').select('form_id').in('form_id', list.map((t) => t.form_id)).eq('is_active', true).limit(5000)
        if (e2) throw e2
        for (const r of rows ?? []) counts.set(r.form_id as string, (counts.get(r.form_id as string) ?? 0) + 1)
      }
      return list.map((t) => ({ ...t, count: Math.max(0, (counts.get(t.form_id) ?? 0) - 1) })) as SectionTemplate[]
    },
  })
}

/** Formulários → Configurações → Seções modelo: seções prontas (com perguntas e ligações com o cadastro) para inserir em qualquer formulário. */
export function SectionTemplatesPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const { data, isLoading } = useSectionTemplates()
  const refresh = () => qc.invalidateQueries({ queryKey: ['form-templates', orgId] })
  const rename = useMutation({
    mutationFn: async (v: { t: SectionTemplate; name: string }) => {
      const a = await supabase.from('form_section_templates').update({ name: v.name }).eq('id', v.t.id)
      if (a.error) throw a.error
      const b = await supabase.from('forms').update({ title: v.name }).eq('id', v.t.form_id)
      if (b.error) throw b.error
    },
    onSuccess: () => { toast.success('Modelo renomeado.'); refresh() },
    onError: (e) => toast.error(/23505|duplicate/i.test(JSON.stringify(e)) ? 'Já existe um modelo com esse nome.' : friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('delete_section_template', { p_template: id }); if (error) throw error },
    onSuccess: () => { toast.success('Modelo apagado. Os formulários que já o usaram não mudam.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <p className="text-muted-foreground">
        Seções prontas para reaproveitar. No editor de qualquer formulário, “Seção modelo” insere uma cópia no fim; mudar o modelo depois não altera formulários que já o usaram.
        Para criar outro, abra uma seção no editor de um formulário e use “Modelo”.
      </p>
      {isLoading && <Skeleton className="h-24" />}
      {data?.length === 0 && <EmptyState>Nenhum modelo ainda. No editor de um formulário, use “Modelo” em uma seção.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={data ?? []} render={(t) => (
          <Card key={t.id} className="flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1 basis-40">
              <Link to={`/${membership?.slug}/formularios/configuracoes/modelos/${t.id}`} className="break-words font-display text-lg font-bold hover:underline">{t.name}</Link>
              <p className="text-sm text-muted-foreground">{t.count} {t.count === 1 ? 'pergunta' : 'perguntas'}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button asChild size="sm" variant="outline"><Link to={`/${membership?.slug}/formularios/configuracoes/modelos/${t.id}`}><Pencil className="h-4 w-4" /> Editar</Link></Button>
              <Button size="sm" variant="outline" onClick={async () => { const n = await promptBox({ title: 'Renomear modelo', message: 'Nome do modelo:', initial: t.name, confirmLabel: 'Salvar' }); if (n && n.trim() && n.trim() !== t.name) rename.mutate({ t, name: n.trim() }) }}>Renomear</Button>
              <Button size="sm" variant="outline" className="text-destructive" aria-label={`Apagar ${t.name}`} onClick={async () => { if (await confirmBox(`Apagar o modelo “${t.name}”? Os formulários que já o usaram não mudam.`)) remove.mutate(t.id) }}><Trash2 className="h-4 w-4" /> Apagar</Button>
            </div>
          </Card>
        )} />
      </div>
    </div>
  )
}
