import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { PublicFormPage } from './PublicFormPage'
import { useForm, useFormFields } from './service'
import type { FieldOption, PublicField, PublicFormPayload } from './types'

/** Pré-visualização do formulário (rascunho atual) para quem tem acesso: mesma tela do link público, sem enviar nada. */
export function FormPreviewPage() {
  const { formId = '' } = useParams()
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const form = useForm(formId)
  const fields = useFormFields(formId)
  // Opções que vêm do cadastro (instrumentos e funções ativos), como na publicação.
  const catalogs = useQuery({
    queryKey: ['form-preview-catalogs', orgId],
    queryFn: async () => {
      const opts = async (table: 'instruments' | 'artistic_functions'): Promise<FieldOption[]> => {
        const { data, error } = await supabase.from(table).select('id, name').eq('organization_id', orgId).eq('is_active', true).order('sort_order').order('name')
        if (error) throw error
        return (data ?? []).map((r) => ({ value: r.id as string, label: r.name as string }))
      }
      return { 'link.instrument': await opts('instruments'), 'link.function': await opts('artistic_functions') } as Record<string, FieldOption[]>
    },
  })
  if (form.isLoading || fields.isLoading || catalogs.isLoading || !form.data || !membership) return <main className="mx-auto max-w-xl p-8"><Skeleton className="h-64" /></main>
  const f = form.data
  const list: PublicField[] = (fields.data ?? []).filter((x) => x.is_active).map((x) => ({
    key: x.field_key, label: x.label, description: x.description, type: x.field_type, required: x.required,
    options: x.member_mapping && catalogs.data?.[x.member_mapping] && x.options.length === 0 ? catalogs.data[x.member_mapping] : x.options,
    default: x.default_value, validation: x.validation, condition: x.condition,
  }))
  const payload: PublicFormPayload = {
    state: 'open',
    organization: { name: membership.name, short_name: membership.name, logo_path: membership.logo_path ?? null, theme: {} },
    form: { title: f.title, description: f.description, privacy_text: f.privacy_text, requires_consent: f.requires_consent, closes_at: f.closes_at, header_image_url: f.header_image_url, fields: list },
  }
  return <PublicFormPage preview={payload} />
}
