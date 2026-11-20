import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'
import type { AnswerValue, Answers } from './types'
import { fetchSensitive } from '@/modules/profile/sensitive'

type Raw = string | boolean | null | undefined
export interface Prefill { by: Record<string, Raw>; names: Record<string, string | undefined>; /** Naipe vigente do integrante (para as seções por naipe). */ sectionId: string | null }

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Converte um dado do cadastro para o tipo de resposta do campo. Em listas, casa a opção pelo código, pelo nome da opção ou pelo nome do item (o perfil grava "feminino"; a opção do formulário pode ser "Feminino"). */
export function toAnswer(type: string, raw: Raw, options: { value: string; label: string }[], name?: string): AnswerValue | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw === 'boolean') return type === 'yes_no' ? (raw ? 'yes' : 'no') : type === 'checkbox' ? raw : raw ? 'yes' : 'no'
  let v: string = raw
  if (options.length > 0) {
    const keys = [raw, name ?? ''].filter(Boolean).map(norm)
    const hit = options.find((o) => o.value === raw) ?? options.find((o) => keys.includes(norm(o.value)) || keys.includes(norm(o.label)))
    if (!hit) return undefined
    v = hit.value
  }
  return type === 'multi_select' ? [v] : v
}

/** Renovação: o que já consta do cadastro do integrante, indexado pelo vínculo do campo com o cadastro. */
export function useMemberPrefill(memberId: string | undefined) {
  return useQuery({
    queryKey: ['form-prefill', memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<Prefill> => {
      const [m, s, l, st, fa] = await Promise.all([
        supabase.from('members').select('full_name, display_name, email, phone, social_handle, birth_date, affective_relation, other_blocks').eq('id', memberId!).maybeSingle(),
        fetchSensitive(memberId!).then((data) => ({ data, error: null })),
        supabase.from('member_artistic_links').select('instrument_id, function_id, skill_level_id, is_primary, instruments(name, section_id), artistic_functions(name), skill_levels(name)').eq('member_id', memberId!).is('ended_at', null).order('is_primary', { ascending: false }),
        supabase.from('staff_assignments').select('section_id, instruments(section_id)').eq('member_id', memberId!).is('valid_to', null).limit(1),
        supabase.from('cycle_fee_assignments').select('fee_categories(name, function_id), cycles!inner(is_current)').eq('member_id', memberId!).eq('cycles.is_current', true).limit(1),
      ])
      for (const r of [m, s, l, st, fa]) if (r.error) throw r.error
      const by: Record<string, Raw> = {}
      const names: Record<string, string | undefined> = {}
      for (const [k, v] of Object.entries(m.data ?? {})) by[`member.${k}`] = v as Raw
      for (const [k, v] of Object.entries(s.data ?? {})) by[`sensitive.${k}`] = v as Raw
      // Instrumento e categoria são vínculos separados (uma linha cada): pega o primeiro de cada tipo.
      type L = { instrument_id: string | null; function_id: string | null; skill_level_id: string | null; instruments: { name: string; section_id: string | null } | null; artistic_functions: { name: string } | null; skill_levels: { name: string } | null }
      const rows = (l.data ?? []) as unknown as L[]
      const inst = rows.find((r) => r.instrument_id)
      const fn = rows.find((r) => r.function_id)
      const lvl = inst?.skill_level_id ? inst : rows.find((r) => r.skill_level_id)
      by['link.instrument'] = inst?.instrument_id; names['link.instrument'] = inst?.instruments?.name
      const cat = ((fa.data ?? []) as unknown as { fee_categories: { name: string; function_id: string | null } | null }[])[0]?.fee_categories
      by['link.function'] = cat?.function_id ?? fn?.function_id; names['link.function'] = cat?.name ?? fn?.artistic_functions?.name
      by['link.skill_level'] = lvl?.skill_level_id; names['link.skill_level'] = lvl?.skill_levels?.name
      // A planilha importada grava "Mulher"/"Homem"; as opções do formulário são Feminino/Masculino.
      const gk = norm(String(by['sensitive.gender'] ?? ''))
      const gAlias = ({ feminino: 'Mulher', masculino: 'Homem', naobinario: 'Pessoa não binária' } as Record<string, string>)[gk]
      if (gAlias) { by['sensitive.gender'] = gAlias; names['sensitive.gender'] = gAlias }
      const staff = ((st.data ?? []) as unknown as { section_id: string | null; instruments: { section_id: string | null } | null }[])[0]
      return { by, names, sectionId: inst?.instruments?.section_id ?? staff?.section_id ?? staff?.instruments?.section_id ?? null }
    },
  })
}

/** Respostas iniciais: cada campo ligado ao cadastro recebe o dado correspondente. */
export function buildInitial(fields: { field_key?: string; key?: string; type?: string; field_type?: string; member_mapping?: string | null; mapping?: string | null; options?: { value: string; label: string }[] | null; is_active?: boolean }[], p: Prefill): Answers {
  const out: Answers = {}
  for (const x of fields) {
    const mp = x.member_mapping ?? x.mapping
    if (x.is_active === false || !mp || !(mp in p.by)) continue
    const v = toAnswer((x.field_type ?? x.type) as string, p.by[mp], x.options ?? [], p.names[mp])
    if (v !== undefined) out[(x.field_key ?? x.key) as string] = v
  }
  return out
}
