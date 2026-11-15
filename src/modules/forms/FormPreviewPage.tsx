import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'
import type { TextVars } from '@/core/textVars'
import { useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { PublicFormPage } from './PublicFormPage'
import { useForm, useFormFields } from './service'
import { ViewAsBar } from '@/app/ViewAsBar'
import type { AnswerValue, Answers, PublicField, PublicFormPayload } from './types'

type Raw = string | boolean | null | undefined

/** Converte um dado do cadastro para o tipo de resposta do campo. */
function toAnswer(type: string, raw: Raw): AnswerValue | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw === 'boolean') return type === 'yes_no' ? (raw ? 'yes' : 'no') : type === 'checkbox' ? raw : raw ? 'yes' : 'no'
  return type === 'multi_select' ? [raw] : raw
}

/** Renovação: o que já consta do cadastro do integrante, indexado pelo vínculo do campo com o cadastro. */
function useMemberPrefill(memberId: string | undefined) {
  return useQuery({
    queryKey: ['form-prefill', memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const [m, s, l] = await Promise.all([
        supabase.from('members').select('full_name, display_name, email, phone, social_handle, birth_date, affective_relation, other_blocks').eq('id', memberId!).maybeSingle(),
        supabase.from('member_sensitive_data').select('gender, is_trans, race_color, is_pcd, pcd_description').eq('member_id', memberId!).maybeSingle(),
        supabase.from('member_artistic_links').select('instrument_id, function_id, skill_level_id, is_primary').eq('member_id', memberId!).is('ended_at', null).order('is_primary', { ascending: false }),
      ])
      for (const r of [m, s, l]) if (r.error) throw r.error
      const by: Record<string, Raw> = {}
      for (const [k, v] of Object.entries(m.data ?? {})) by[`member.${k}`] = v as Raw
      for (const [k, v] of Object.entries(s.data ?? {})) by[`sensitive.${k}`] = v as Raw
      // Instrumento e categoria são vínculos separados (uma linha cada): pega o primeiro de cada tipo.
      const rows = l.data ?? []
      const inst = rows.find((r) => r.instrument_id)
      by['link.instrument'] = inst?.instrument_id; by['link.function'] = rows.find((r) => r.function_id)?.function_id; by['link.skill_level'] = (inst ?? rows.find((r) => r.skill_level_id))?.skill_level_id
      if (!by['link.skill_level']) by['link.skill_level'] = rows.find((r) => r.skill_level_id)?.skill_level_id
      return by
    },
  })
}

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
  const initial: Answers | undefined = memberId && prefill.data
    ? Object.fromEntries((fields.data ?? []).filter((x) => x.is_active && x.member_mapping && x.member_mapping in prefill.data).map((x) => [x.field_key, toAnswer(x.field_type, prefill.data[x.member_mapping!])]).filter(([, v]) => v !== undefined))
    : undefined
  const payload: PublicFormPayload = {
    state: 'open',
    organization: { name: membership.name, short_name: membership.name, logo_path: membership.logo_path ?? null, theme: {} },
    form: { title: f.title, description: f.description, privacy_text: f.privacy_enabled ? f.privacy_text : null, requires_consent: f.requires_consent, closes_at: f.closes_at, send_text: f.send_enabled ? f.send_text : null, show_confirmation: f.confirmation_enabled, vars: vars.data ?? null, header: { image_url: f.header_image_url, x: Number(f.header_pos_x), y: Number(f.header_pos_y), zoom: Number(f.header_zoom), logo: f.header_logo_size, color: f.header_color, height: f.header_height }, fields: list },
  }
  return <>{bar}<PublicFormPage key={memberId ?? 'eu'} preview={payload} initialAnswers={initial} /></>
}
