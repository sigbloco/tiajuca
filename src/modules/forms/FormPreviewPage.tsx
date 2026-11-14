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
  if (form.isLoading || fields.isLoading || !form.data || !membership) return <main className="mx-auto max-w-xl p-8"><Skeleton className="h-64" /></main>
  const f = form.data
  const list: PublicField[] = (fields.data ?? []).filter((x) => x.is_active).map((x) => ({
    key: x.field_key, label: x.label, description: x.description, type: x.field_type, required: x.required,
    options: x.options,
    default: x.default_value, validation: x.validation, condition: x.condition,
  }))
  const payload: PublicFormPayload = {
    state: 'open',
    organization: { name: membership.name, short_name: membership.name, logo_path: membership.logo_path ?? null, theme: {} },
    form: { title: f.title, description: f.description, privacy_text: f.privacy_text, requires_consent: f.requires_consent, closes_at: f.closes_at, header: { image_url: f.header_image_url, x: Number(f.header_pos_x), y: Number(f.header_pos_y), zoom: Number(f.header_zoom), height: f.header_height }, fields: list },
  }
  return <PublicFormPage preview={payload} />
}
