import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SaveButton } from '@/components/shared/SaveButton'
import { StickySave } from '@/components/shared/StickySave'
import { Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { FormSettingsTabs } from './FormSettingsTabs'
import { SEND_FALLBACK, SendFields, sendColumns, type SendTexts } from './SendSection'

/** Lê os textos padrão de Envio da organização (ou null se ainda não houver). Usado ao criar um formulário novo. */
export async function loadSendDefaults(orgId: string) {
  const { data, error } = await supabase.from('form_send_defaults').select('privacy_text, send_text, confirmation_message, review_message, approved_email_text, rejected_email_text, waitlist_email_text').eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return data as { privacy_text: string | null; send_text: string | null; confirmation_message: string; review_message: string; approved_email_text: string; rejected_email_text: string; waitlist_email_text: string } | null
}

/** Formulários → Configurações → Textos padrão: os textos com que todo formulário novo começa. Formulários já criados não mudam. */
export function SendDefaultsPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canEdit = usePermission('forms.manage')
  const row = useQuery({ queryKey: ['form-send-defaults', orgId], queryFn: () => loadSendDefaults(orgId) })
  const [f, setF] = useState<SendTexts>({ privacy: SEND_FALLBACK.privacy, send: '', confirmation: SEND_FALLBACK.confirmation, review: SEND_FALLBACK.review, approved: SEND_FALLBACK.approved, rejected: SEND_FALLBACK.rejected, waitlist: SEND_FALLBACK.waitlist })
  useEffect(() => {
    if (!row.isSuccess) return
    const d = row.data
    setF(d ? { privacy: d.privacy_text ?? '', send: d.send_text ?? '', confirmation: d.confirmation_message, review: d.review_message, approved: d.approved_email_text, rejected: d.rejected_email_text, waitlist: d.waitlist_email_text }
      : { privacy: SEND_FALLBACK.privacy, send: '', confirmation: SEND_FALLBACK.confirmation, review: SEND_FALLBACK.review, approved: SEND_FALLBACK.approved, rejected: SEND_FALLBACK.rejected, waitlist: SEND_FALLBACK.waitlist })
  }, [row.isSuccess, row.data])
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('form_send_defaults').upsert({ organization_id: orgId, ...sendColumns(f), updated_at: new Date().toISOString() }, { onConflict: 'organization_id' }); if (error) throw error },
    onSuccess: () => { toast.success('Textos padrão salvos. Valem para os próximos formulários.'); qc.invalidateQueries({ queryKey: ['form-send-defaults', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <p className="text-muted-foreground">
        O texto de privacidade e os textos da seção fixa de Envio com que todo formulário novo começa. Cada formulário pode mudar os seus no editor; mexer aqui não altera os que já existem.
      </p>
      {row.isLoading ? <Skeleton className="h-40" /> : (
        <form onSubmit={(e) => { e.preventDefault(); if (canEdit) save.mutate() }} className="space-y-4">
          <fieldset disabled={!canEdit} className="min-w-0 space-y-4 border-0 p-0">
            <SendFields f={f} setF={setF} prefix="dd" />
          </fieldset>
          {canEdit && <StickySave><SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar textos padrão" /></StickySave>}
        </form>
      )}
    </div>
  )
}
