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
import { RestorePartButton, SEND_FACTORY, SendFields, SendPartTabs, rowToSend, sendColumns, type SendPart, type SendTexts } from './SendSection'

/** Lê os textos padrão de Envio da organização (ou null se ainda não houver). Usado ao criar um formulário novo. */
export async function loadSendDefaults(orgId: string) {
  const { data, error } = await supabase.from('form_send_defaults')
    .select('privacy_text, send_text, confirmation_message, review_message, approved_email_text, rejected_email_text, waitlist_email_text, privacy_enabled, send_enabled, confirmation_enabled, review_enabled, approved_enabled, rejected_enabled, waitlist_enabled')
    .eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return data as Record<string, unknown> | null
}

/** Formulários → Configurações → Textos padrão: os textos com que todo formulário novo começa. Formulários já criados não mudam. */
export function SendDefaultsPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canEdit = usePermission('forms.manage')
  const [part, setPart] = useState<SendPart>('form')
  const row = useQuery({ queryKey: ['form-send-defaults', orgId], queryFn: () => loadSendDefaults(orgId) })
  const [f, setF] = useState<SendTexts>(SEND_FACTORY)
  useEffect(() => { if (row.isSuccess) setF({ ...rowToSend(row.data), on: SEND_FACTORY.on }) }, [row.isSuccess, row.data])
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('form_send_defaults').upsert({ organization_id: orgId, ...sendColumns({ ...f, on: SEND_FACTORY.on }), updated_at: new Date().toISOString() }, { onConflict: 'organization_id' }); if (error) throw error },
    onSuccess: () => { toast.success('Textos padrão salvos. Valem para os próximos formulários.'); qc.invalidateQueries({ queryKey: ['form-send-defaults', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-4">
      <FormSettingsTabs />
      <p className="text-muted-foreground">
        O texto de privacidade e os textos do Envio com que todo formulário novo começa. Cada formulário pode mudar os seus na aba Envio; mexer aqui não altera os que já existem.
      </p>
      {row.isLoading ? <Skeleton className="h-40" /> : (
        <form id="defaults-form" onSubmit={(e) => { e.preventDefault(); if (canEdit) save.mutate() }} className="space-y-4">
          <SendPartTabs part={part} setPart={setPart} />
          <fieldset disabled={!canEdit} className="min-w-0 space-y-4 border-0 p-0">
            <SendFields f={f} setF={setF} prefix="dd" part={part} disabled={!canEdit} toggles={false} />
          </fieldset>
          {canEdit && <RestorePartButton f={f} setF={setF} part={part} source={async () => SEND_FACTORY} />}
          {canEdit && <StickySave><SaveButton type="submit" form="defaults-form" className="w-full" disabled={save.isPending} hint="Salvar textos padrão" /></StickySave>}
        </form>
      )}
    </div>
  )
}
