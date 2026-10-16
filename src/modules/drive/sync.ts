import { supabase } from '@/core/supabase'

export interface SyncPerson { email: string; name?: string }
export interface SyncPreview {
  mode: 'preview' | 'apply'
  folder_name: string
  service_account: string
  already_ok: number
  add: SyncPerson[]
  remove: SyncPerson[]
  added?: number
  removed?: number
  failed?: number
  failed_list?: { email: string; name?: string; reason: string }[]
}

/** Chama a Edge Function `drive-sync`; devolve a mensagem em português vinda do servidor quando houver erro. */
export async function driveSync(folderId: string, mode: 'preview' | 'apply'): Promise<SyncPreview> {
  const { data, error } = await supabase.functions.invoke('drive-sync', { body: { folder_id: folderId, mode } })
  if (error) {
    let msg = 'A sincronização com o Google Drive não está disponível. Confira se a função drive-sync foi publicada.'
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg
    } catch { /* usa a mensagem padrão */ }
    throw Object.assign(new Error(msg), { code: 'P0001' })
  }
  return data as SyncPreview
}
