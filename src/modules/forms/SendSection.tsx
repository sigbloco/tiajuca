import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Pencil, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { confirmBox } from '@/components/shared/DialogHost'
import { RichTextarea } from '@/components/shared/RichText'
import { SaveButton } from '@/components/shared/SaveButton'
import { Badge, Button, Card, Label, Sheet, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useForm } from './service'
import { loadSendDefaults } from './SendDefaultsPage'

const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />

/** Os cinco textos da seção de Envio (os do formulário e os padrão das Configurações usam os mesmos campos). */
export interface SendTexts { send: string; confirmation: string; review: string; approved: string; rejected: string; waitlist: string }
export const SEND_FALLBACK = {
  confirmation: 'Inscrição recebida!',
  review: 'Recebemos a sua inscrição e a Direção está avaliando. Você receberá a confirmação por e-mail.',
  approved: 'Sua inscrição foi aprovada. Obrigado por se inscrever! A Direção entrará em contato com os próximos passos.',
  rejected: 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.',
  waitlist: 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a Direção avisa se uma vaga abrir.',
}
/** Colunas da tabela (forms e form_send_defaults) a partir dos textos, com o texto padrão quando um campo fica vazio. */
export const sendColumns = (f: SendTexts) => ({
  send_text: f.send.trim() || null, confirmation_message: f.confirmation.trim() || SEND_FALLBACK.confirmation,
  review_message: f.review.trim() || SEND_FALLBACK.review, approved_email_text: f.approved.trim() || SEND_FALLBACK.approved, rejected_email_text: f.rejected.trim() || SEND_FALLBACK.rejected, waitlist_email_text: f.waitlist.trim() || SEND_FALLBACK.waitlist,
})

export function SendFields({ f, setF, prefix }: { f: SendTexts; setF: (v: SendTexts) => void; prefix: string }) {
  return (
    <>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-send`}>Antes de enviar (opcional, aparece na última etapa)</Label>
        <RichTextarea id={`${prefix}-send`} rows={3} value={f.send} onChange={(v) => setF({ ...f, send: v })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-conf`}>Depois de enviar (mensagem na tela)</Label>
        <Textarea id={`${prefix}-conf`} rows={2} value={f.confirmation} onChange={(e) => setF({ ...f, confirmation: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-rev`}>Enquanto a Direção avalia (tela de quem entrou com o Google)</Label>
        <Textarea id={`${prefix}-rev`} rows={3} value={f.review} onChange={(e) => setF({ ...f, review: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-app`}><Mail className="mr-1 inline h-4 w-4" />E-mail de aprovação</Label>
        <Textarea id={`${prefix}-app`} rows={4} value={f.approved} onChange={(e) => setF({ ...f, approved: e.target.value })} />
        <p className="text-xs text-muted-foreground">Confirmação de que a inscrição foi aprovada. Não libera acesso por si só: o acesso segue por convite.</p></div>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-rej`}><Mail className="mr-1 inline h-4 w-4" />Texto-base da rejeição</Label>
        <Textarea id={`${prefix}-rej`} rows={4} value={f.rejected} onChange={(e) => setF({ ...f, rejected: e.target.value })} />
        <p className="text-xs text-muted-foreground">Ao rejeitar, a Direção pode editar esta mensagem antes de enviar o e-mail.</p></div>
      <div className="space-y-1.5"><Label htmlFor={`${prefix}-wait`}><Mail className="mr-1 inline h-4 w-4" />E-mail de lista de espera</Label>
        <Textarea id={`${prefix}-wait`} rows={4} value={f.waitlist} onChange={(e) => setF({ ...f, waitlist: e.target.value })} />
        <p className="text-xs text-muted-foreground">Enviado quando a Direção aprova a inscrição na lista de espera (vaga esgotada). Sem posição na fila: a Direção escolhe quem entra por critérios próprios.</p></div>
    </>
  )
}

/** Seção fixa de Envio: sempre fica no fim do formulário, não pode ser apagada nem movida; só os textos são editáveis (valem na hora, sem republicar). */
export function SendSection({ formId }: { formId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: form } = useForm(formId)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<SendTexts>({ send: '', confirmation: '', review: '', approved: '', rejected: '', waitlist: '' })
  const start = () => {
    if (!form) return
    setF({ send: form.send_text ?? '', confirmation: form.confirmation_message, review: form.review_message, approved: form.approved_email_text, rejected: form.rejected_email_text, waitlist: form.waitlist_email_text })
    setOpen(true)
  }
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('forms').update(sendColumns(f)).eq('id', formId); if (error) throw error },
    onSuccess: () => { toast.success('Textos do envio salvos.'); qc.invalidateQueries({ queryKey: ['form', orgId, formId] }); setOpen(false) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!form) return null
  return (
    <>
      <Card className="flex flex-wrap items-center gap-2 border-l-4 border-l-primary bg-muted/60 p-2.5">
        <Send className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <button className="min-w-0 flex-1 basis-40 text-left" onClick={start}>
          <p className="font-display text-lg font-bold leading-tight">Envio</p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Badge>Seção fixa</Badge>
            <span>Textos de depois do envio, da avaliação e dos e-mails de aprovação e rejeição.</span>
          </p>
        </button>
        <Button size="sm" variant="outline" aria-label="Editar os textos do envio" title="Editar" onClick={start}><Pencil className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Editar</span></Button>
      </Card>
      <Sheet open={open} onOpenChange={setOpen}>
        {open && (
          <SheetContent title="Envio" description="Textos fixos do fim do formulário. Valem na hora, sem republicar.">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
              <SendFields f={f} setF={setF} prefix="sd" />
              <Button type="button" variant="outline" onClick={async () => {
                if (!(await confirmBox('Substituir todos os textos do envio pelos padrões das Configurações?'))) return
                try {
                  const d = await loadSendDefaults(orgId)
                  setF({ send: d?.send_text ?? '', confirmation: d?.confirmation_message ?? SEND_FALLBACK.confirmation, review: d?.review_message ?? SEND_FALLBACK.review, approved: d?.approved_email_text ?? SEND_FALLBACK.approved, rejected: d?.rejected_email_text ?? SEND_FALLBACK.rejected, waitlist: d?.waitlist_email_text ?? SEND_FALLBACK.waitlist })
                  toast.success('Textos padrão colocados. Salve para aplicar.')
                } catch (e) { toast.error(friendlyError(e)) }
              }}><RotateCcw className="h-4 w-4" /> Restaurar textos padrão</Button>
              <SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar textos do envio" />
            </form>
          </SheetContent>
        )}
      </Sheet>
    </>
  )
}
