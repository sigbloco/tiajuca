import type { HeaderFrame } from './HeaderBand'
export type FieldType =
  | 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'date'
  | 'single_select' | 'multi_select' | 'checkbox' | 'yes_no' | 'scale' | 'file' | 'info'

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  short_text: 'Texto curto', long_text: 'Texto longo', email: 'E-mail', phone: 'Telefone', number: 'Número', date: 'Data',
  single_select: 'Seleção única', multi_select: 'Seleção múltipla', checkbox: 'Caixa de marcar', yes_no: 'Sim / Não',
  scale: 'Escala', file: 'Envio de arquivo', info: 'Texto informativo',
}

export interface FieldOption { value: string; label: string; /** Texto que aparece abaixo da opção (listas do cadastro e categorias, quando a pergunta mostra descrições). */ description?: string }
export interface FieldCondition { field: string; op: 'eq' | 'neq'; value: string }

/** `section`: o campo é o cabeçalho de uma seção. `consent` (numa seção): a seção termina com o consentimento (texto de privacidade + "estou ciente e concordo"). */
export interface FieldValidation { /** Opções vindas de uma lista criada em Listas do cadastro (id da lista). */ listSource?: string; /** Pergunta de nível: qual lista de níveis (vazio = a padrão). */ levelList?: string; /** Listas automáticas: mostra a descrição de cada opção. */ descriptions?: boolean; min?: number; max?: number; maxLength?: number; section?: boolean; consent?: boolean; /** Seção de login: só mostra o botão "Continuar com Google" (sem perguntas); o envio exige a conta e usa o e-mail dela. */ login?: boolean; /** Seleção com a opção "Outro" (texto livre). */ other?: boolean; /** Campo de redes sociais (rede + usuário). */ social?: boolean; /** Redes que aparecem no menu do campo de redes sociais (vazio = todas). */ networks?: string[] }
export const isSection = (f: { type?: FieldType; field_type?: FieldType; validation: FieldValidation }) => (f.type ?? f.field_type) === 'info' && !!f.validation.section
/** Seção de login (sem perguntas). */
export const isLoginSection = (f: { type?: FieldType; field_type?: FieldType; validation: FieldValidation }) => isSection(f) && !!f.validation.login
/** Seção que termina com o consentimento. */
export const hasConsent = (f: { type?: FieldType; field_type?: FieldType; validation: FieldValidation }) => isSection(f) && !!f.validation.consent

export interface PublicField {
  key: string
  label: string
  description: string | null
  type: FieldType
  required: boolean
  options: FieldOption[]
  default: string | null
  validation: FieldValidation
  condition: FieldCondition | null
  /** Só nos formulários internos: ligação do campo com o cadastro (para vir preenchido). */ mapping?: string | null
}

export interface PublicFormPayload {
  state: 'open' | 'not_open' | 'closed' | 'full' | 'not_found' | 'login_required' | 'not_member' | 'already'
  access?: 'public' | 'internal'
  /** Formulário interno: a resposta que o integrante já enviou (pendente: dá para editar; aprovada: trava). */ mine?: { status: 'pending' | 'approved'; answers: Answers; submitted_at: string; edited_at: string | null } | null
  /** Formulário interno: o integrante que entrou e o naipe dele (as seções por naipe usam isto). */ viewer?: { member_id: string; name: string; section_id: string | null } | null
  organization?: { name: string; short_name: string; logo_path: string | null; theme: Record<string, string> }
  form?: { title: string; description: string | null; privacy_text: string | null; requires_consent: boolean; closes_at: string | null; send_text?: string | null; show_confirmation?: boolean; /** Valores atuais do bloco para as variáveis dos textos. */ vars?: import('@/core/textVars').TextVars | null; /** Instrumentos com a vaga preenchida: aparecem como "Esgotado - Lista de espera". */ full_options?: string[]; header?: HeaderFrame; fields: PublicField[] }
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
  // Na ordem em que aparecem no perfil do integrante.
  'member.full_name': 'Nome completo', 'member.display_name': 'Nome pelo qual prefere ser chamado', 'member.email': 'E-mail',
  'member.phone': 'Celular', 'member.social_handle': 'Redes sociais', 'member.birth_date': 'Data de nascimento',
  'sensitive.gender': 'Como você se identifica? (sensível)', 'sensitive.is_trans': 'Se considera trans (sensível)',
  'sensitive.race_color': 'Como você identifica sua cor/raça? (sensível)', 'sensitive.is_pcd': 'É PCD (sensível)', 'sensitive.pcd_description': 'Qual deficiência (sensível)',
  'link.instrument': 'Instrumento (participação artística)', 'link.skill_level': 'Nível no instrumento', 'link.function': 'Categoria principal (contribuição)',
  'member.other_blocks': 'Outros blocos (texto livre)', 'member.played_other_blocks': 'Já tocou em outros blocos? (sim/não) — antigo',
  'member.affective_relation': 'Relação com a Grande Tijuca', 'member.custom': 'Novo campo no cadastro (Outras informações)',
}
