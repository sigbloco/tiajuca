import { supabase } from '@/core/supabase'

export interface DriveConfig { configured: boolean; active: boolean; folder_id?: string }
export interface DriveFile { id: string; name: string; is_folder: boolean; mime_type: string; web_view_link: string | null; modified_at: string | null }
export interface DriveList { files: DriveFile[]; next_page_token: string | null; folder_id: string; root_id: string }
export interface DriveStatus { ok: boolean; service_account?: string; folder_name?: string; error?: string }

export async function getDriveConfig(orgId: string): Promise<DriveConfig> {
  const { data, error } = await supabase.rpc('drive_integration_config', { p_org: orgId })
  if (error) throw error
  return data as DriveConfig
}

/** Chama a Edge Function; devolve a mensagem em português vinda do servidor quando houver erro. */
export async function driveInvoke<T>(orgId: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('drive-search', { body: { organization_id: orgId, ...body } })
  if (error) {
    let msg = 'A integração com o Google Drive não está disponível no momento.'
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg
    } catch { /* usa a mensagem padrão */ }
    throw Object.assign(new Error(msg), { code: 'P0001' })
  }
  return data as T
}
