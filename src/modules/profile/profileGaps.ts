import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'

interface MeRow { email: string | null; phone: string | null; social_handle: string | null; birth_date: string | null; affective_relation: string | null; other_blocks: string | null; played_instrument: string | null }
interface SensRow { gender: string | null; is_trans: boolean | null; race_color: string | null; is_pcd: boolean | null }

const blank = (v: string | null | undefined) => !v || v.trim() === ''

/** Campos do perfil ainda em branco (mesmo os opcionais), na ordem em que aparecem na página. `null` enquanto carrega. */
export function useProfileGaps(orgId: string | undefined, memberId: string | undefined, enabled = true): string[] | null {
  const on = enabled && Boolean(orgId && memberId)
  // Mesmas chaves e consultas da página do perfil: preencher e salvar atualiza o aviso e a bolinha na hora.
  const me = useQuery({
    queryKey: ['me', orgId, memberId], enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('full_name, display_name, email, phone, social_handle, birth_date, joined_at, affective_relation, played_other_blocks, other_blocks, played_instrument').eq('id', memberId!).single()
      if (error) throw error
      return data as unknown as MeRow
    },
  })
  const sens = useQuery({
    queryKey: ['my-sensitive', orgId, memberId], enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_sensitive_data').select('gender, is_trans, race_color, is_pcd, pcd_description').eq('member_id', memberId!).maybeSingle()
      if (error) throw error
      return data as unknown as SensRow | null
    },
  })
  if (!on || !me.data || !sens.isSuccess) return null
  const m = me.data, s = sens.data
  const gaps: string[] = []
  if (blank(m.phone)) gaps.push('celular')
  if (blank(m.social_handle)) gaps.push('redes sociais')
  if (blank(m.birth_date)) gaps.push('data de nascimento')
  if (blank(s?.gender)) gaps.push('como você se identifica')
  if (s?.is_trans == null) gaps.push('se se considera trans')
  if (blank(s?.race_color)) gaps.push('como você identifica sua cor/raça')
  if (s?.is_pcd == null) gaps.push('deficiência')
  if (blank(m.played_instrument)) gaps.push('instrumento que toca ou já tocou')
  if (blank(m.other_blocks)) gaps.push('outros blocos')
  if (blank(m.affective_relation)) gaps.push('relação com a Grande Tijuca')
  return gaps
}
