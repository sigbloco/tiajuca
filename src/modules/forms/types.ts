export type FieldType =
  | 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'date'
  | 'single_select' | 'multi_select' | 'checkbox' | 'yes_no' | 'scale' | 'file' | 'info'

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  short_text: 'Texto curto', long_text: 'Texto longo', email: 'E-mail', phone: 'Telefone', number: 'Número', date: 'Data',
  single_select: 'Seleção única', multi_select: 'Seleção múltipla', checkbox: 'Caixa de marcar', yes_no: 'Sim / Não',
  scale: 'Escala', file: 'Envio de arquivo', info: 'Texto informativo',
}

export interface FieldOption { value: string; label: string }
export interface FieldCondition { field: string; op: 'eq' | 'neq'; value: string }

export interface PublicField {
  key: string
  label: string
  description: string | null
  type: FieldType
  required: boolean
  options: FieldOption[]
  default: string | null
  validation: { min?: number; max?: number; maxLength?: number }
  condition: FieldCondition | null
}

export interface PublicFormPayload {
  state: 'open' | 'not_open' | 'closed' | 'full' | 'not_found'
  organization?: { name: string; short_name: string; logo_path: string | null; theme: Record<string, string> }
  form?: { title: string; description: string | null; privacy_text: string | null; requires_consent: boolean; closes_at: string | null; fields: PublicField[] }
}

export type AnswerValue = string | number | boolean | string[]
export type Answers = Record<string, AnswerValue | undefined>

/** Mesma regra do servidor: o campo só aparece se a condição (sobre um campo anterior) for satisfeita. */
export function isVisible(f: { condition: FieldCondition | null }, answers: Answers): boolean {
  if (!f.condition) return true
  const raw = answers[f.condition.field]
  const pv = raw === undefined ? undefined : String(raw)
  return f.condition.op === 'neq' ? pv !== f.condition.value : pv === f.condition.value
}

export const MAPPING_LABEL: Record<string, string> = {
  'member.full_name': 'Nome completo', 'member.display_name': 'Nome pelo qual prefere ser chamado', 'member.email': 'E-mail',
  'member.phone': 'Celular', 'member.social_handle': 'Rede social', 'member.birth_date': 'Data de nascimento',
  'member.affective_relation': 'Relação com a Grande Tijuca', 'member.played_other_blocks': 'Já tocou em outros blocos? (sim/não)',
  'member.other_blocks': 'Quais outros blocos', 'sensitive.gender': 'Gênero (sensível)', 'sensitive.is_trans': 'Se considera trans (sensível)',
  'sensitive.race_color': 'Cor/raça (sensível)', 'sensitive.is_pcd': 'É PCD (sensível)', 'sensitive.pcd_description': 'Qual deficiência (sensível)',
  'link.instrument': 'Instrumento (vínculo artístico)', 'link.function': 'Função (vínculo artístico)', 'link.skill_level': 'Nível (vínculo artístico)',
}
