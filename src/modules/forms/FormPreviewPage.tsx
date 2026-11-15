import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'
import type { TextVars } from '@/core/textVars'
import { useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { PublicFormPage } from './PublicFormPage'
import { useForm, useFormFields } from './service'
import { ViewAsBar } from '@/app/ViewAsBar'
import { buildInitial, useMemberPrefill } from './prefill'
import type { PublicField, PublicFormPayload } from './types'

/** Pré-visualização do formulário (rascunho atual) para quem tem acesso: mesma tela do link público, sem enviar nada. Com "Visualizar como", vem preenchido com os dados do integrante escolhido. */
export function FormPreviewPage() {
  const { formId = '' } = useParams()
  const { membership, viewAs } = useOrganization()
  const form = useForm(formId)
  const fields = useFormFields(formId)
  const memberId = viewAs && !viewAs.virtual ? viewAs.member_id : undefined
  const prefill = useMemberPrefill(memberId)
  // Valores das variáveis ({valor}, {whatsapp}...) como no formulário publicado.
  const vars = useQuery({ queryKey: ['form-vars', formId], queryFn: async () => { const { data, error } = await supabase.rpc('form_vars', { p_form: formId }); if (error) throw error; return data as TextVars } })
  const bar = <ViewAsBar contained />
  if (form.isLoading || fields.isLoading || vars.isLoading || (!!memberId && prefill.isLoading) || !form.data || !membership) return <>{bar}<main className="mx-auto max-w-xl p-8"><Skeleton className="h-64" /></main></>
  const f = form.data
  const list: PublicField[] = (fields.data ?? []).filter((x) => x.is_active).map((x) => ({
    key: x.field_key, label: x.label, description: x.description, type: x.field_type, required: x.required,
    options: x.options,
    default: x.default_value, validation: x.validation, condition: x.condition,
  }))
  const initial = memberId && prefill.data ? buildInitial(fields.data ?? [], prefill.data) : undefined
  const payload: PublicFormPayload = {
    state: 'open', access: f.access ?? 'public',
    viewer: memberId && prefill.data ? { member_id: memberId, name: viewAs?.display_name ?? '', section_id: prefill.data.sectionId } : undefined,
    organization: { name: membership.name, short_name: membership.name, logo_path: membership.logo_path ?? null, theme: {} },
    form: { title: f.title, description: f.description, privacy_text: f.privacy_enabled ? f.privacy_text : null, requires_consent: f.requires_consent, closes_at: f.closes_at, send_text: f.send_enabled ? f.send_text : null, show_confirmation: f.confirmation_enabled, vars: vars.data ?? null, header: { image_url: f.header_image_url, x: Number(f.header_pos_x), y: Number(f.header_pos_y), zoom: Number(f.header_zoom), logo: f.header_logo_size, color: f.header_color, height: f.header_height }, fields: list },
  }
  return <>{bar}<PublicFormPage key={memberId ?? 'eu'} preview={payload} initialAnswers={initial} /></>
}
