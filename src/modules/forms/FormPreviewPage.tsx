import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'
import type { TextVars } from '@/core/textVars'
import { useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { PublicFormPage } from './PublicFormPage'
import { useForm, useFormFields } from './service'
import type { PublicField, PublicFormPayload } from './types'

/** Pré-visualização do formulário (rascunho atual) para quem tem acesso: mesma tela do link público, sem enviar nada. */
export function FormPreviewPage() {
  const { formId = '' } = useParams()
  const { membership } = useOrganization()
  const form = useForm(formId)
  const fields = useFormFields(formId)
  // Valores das variáveis ({valor}, {whatsapp}...) como no formulário publicado.
  const vars = useQuery({ queryKey: ['form-vars', formId], queryFn: async () => { const { data, error } = await supabase.rpc('form_vars', { p_form: formId }); if (error) throw error; return data as TextVars } })
  if (form.isLoading || fields.isLoading || vars.isLoading || !form.data || !membership) return <main className="mx-auto max-w-xl p-8"><Skeleton className="h-64" /></main>
  const f = form.data
  const list: PublicField[] = (fields.data ?? []).filter((x) => x.is_active).map((x) => ({
    key: x.field_key, label: x.label, description: x.description, type: x.field_type, required: x.required,
    options: x.options,
    default: x.default_value, validation: x.validation, condition: x.condition,
  }))
  const payload: PublicFormPayload = {
    state: 'open',
    organization: { name: membership.name, short_name: membership.name, logo_path: membership.logo_path ?? null, theme: {} },
    form: { title: f.title, description: f.description, privacy_text: f.privacy_enabled ? f.privacy_text : null, requires_consent: f.requires_consent, closes_at: f.closes_at, send_text: f.send_enabled ? f.send_text : null, show_confirmation: f.confirmation_enabled, vars: vars.data ?? null, header: { image_url: f.header_image_url, x: Number(f.header_pos_x), y: Number(f.header_pos_y), zoom: Number(f.header_zoom), logo: f.header_logo_size, color: f.header_color, height: f.header_height }, fields: list },
  }
  return <PublicFormPage preview={payload} />
}
