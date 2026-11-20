import { supabase } from '@/core/supabase'

/** Dados pessoais sensíveis (LGPD): gênero, pessoa trans, raça/cor, PCD. */
export interface SensitiveRow { gender: string | null; is_trans: boolean | null; race_color: string | null; is_pcd: boolean | null; pcd_description: string | null }

/**
 * Lê os dados sensíveis de uma pessoa sempre pela RPC: o próprio lê os seus; quem tem "dados sensíveis" lê os dos outros
 * e o banco registra a leitura na auditoria (a leitura direta da tabela só vale para o próprio).
 */
export async function fetchSensitive(memberId: string): Promise<SensitiveRow | null> {
  const { data, error } = await supabase.rpc('get_member_sensitive', { p_member: memberId })
  if (error) throw error
  return ((data ?? []) as SensitiveRow[])[0] ?? null
}

/** Grava (o próprio ou quem pode editar dados sensíveis). Campos vazios viram nulos. */
export async function saveSensitive(memberId: string, v: SensitiveRow): Promise<void> {
  const { error } = await supabase.rpc('save_member_sensitive', {
    p_member: memberId, p_gender: v.gender, p_is_trans: v.is_trans, p_race_color: v.race_color, p_is_pcd: v.is_pcd, p_pcd_description: v.pcd_description,
  })
  if (error) throw error
}
