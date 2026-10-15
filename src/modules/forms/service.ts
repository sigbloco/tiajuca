import { useQuery } from '@tanstack/react-query'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import type { FieldCondition, FieldOption, FieldType } from './types'

export type FormStatus = 'draft' | 'published' | 'closed' | 'archived'
export const FORM_STATUS_LABEL: Record<FormStatus, string> = { draft: 'Rascunho', published: 'Publicado', closed: 'Encerrado', archived: 'Arquivado' }
export const FORM_STATUS_CLASS: Record<FormStatus, string> = {
  draft: 'bg-muted text-muted-foreground', published: 'bg-success/15 text-success', closed: 'bg-warning/15 text-warning', archived: 'bg-muted text-muted-foreground',
}

export interface FormRow {
  id: string; title: string; description: string | null; slug: string; cycle_id: string | null; status: FormStatus
  opens_at: string | null; closes_at: string | null; confirmation_message: string; max_responses: number | null
  privacy_text: string | null; requires_consent: boolean; prevent_duplicates: boolean; published_version_id: string | null; updated_at?: string
  form_submissions?: { count: number }[]
}
export interface FormFieldRow {
  id: string; form_id: string; field_key: string; label: string; description: string | null; field_type: FieldType; required: boolean
  sort_order: number; options: FieldOption[]; default_value: string | null; validation: { min?: number; max?: number; maxLength?: number }
  condition: FieldCondition | null; member_mapping: string | null; is_active: boolean
}
export interface SubmissionRow {
  id: string; form_id: string; form_version_id: string; answers: Record<string, unknown>; consent_given: boolean
  status: 'pending' | 'approved' | 'rejected' | 'archived'; reviewer_notes: string | null; reviewed_at: string | null
  member_id: string | null; applicant_email: string | null; submitted_at: string; purged_at: string | null
}
export const SUB_STATUS_LABEL = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', archived: 'Arquivada' } as const
export const SUB_STATUS_CLASS = {
  pending: 'bg-warning/15 text-warning', approved: 'bg-success/15 text-success', rejected: 'bg-destructive/15 text-destructive', archived: 'bg-muted text-muted-foreground',
} as const

export const publicUrl = (orgSlug: string, formSlug: string) => `${window.location.origin}/f/${orgSlug}/${formSlug}`
export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'formulario'
export const keyify = (s: string) => {
  const k = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36)
  return /^[a-z]/.test(k) ? k : `campo_${k}`.slice(0, 40)
}

export function useForm(id: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form', orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('forms').select('*').eq('id', id).single()
      if (error) throw error
      return data as FormRow
    },
  })
}

export function useFormFields(id: string) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['form-fields', orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_fields').select('*').eq('form_id', id).order('sort_order').order('created_at')
      if (error) throw error
      return (data ?? []) as FormFieldRow[]
    },
  })
}
