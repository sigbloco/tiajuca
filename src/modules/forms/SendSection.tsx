import { VarsHint } from '@/components/shared/VarsHint'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Mail, Pencil, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { confirmBox } from '@/components/shared/DialogHost'
import { RichTextarea } from '@/components/shared/RichText'
import { SaveButton } from '@/components/shared/SaveButton'
import { StickySave } from '@/components/shared/StickySave'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import type { FormRow } from './service'
import { loadSendDefaults } from './SendDefaultsPage'

/** Cada mensagem do envio liga/desliga: formulário que não é inscrição de oficina não precisa de avaliação, aprovação etc. */
export type SendKey = 'privacy' | 'send' | 'confirmation' | 'review' | 'approved' | 'rejected' | 'waitlist'
export type SendTexts = Record<SendKey, string> & { on: Record<SendKey, boolean> }
export type SendPart = 'form' | 'email'

export const SEND_FALLBACK: Record<SendKey, string> = {
  privacy: 'Usaremos seus dados apenas para analisar sua inscrição e, se aprovada, para o cadastro no bloco. Informações como gênero, cor/raça e deficiência são sensíveis, ficam restritas à direção e não aparecem em listas ou relatórios comuns. Você pode pedir a correção ou exclusão dos seus dados a qualquer momento.',
  send: '',
  confirmation: 'Inscrição recebida!',
  review: 'Recebemos a sua inscrição e a direção está avaliando. Você receberá a confirmação por e-mail.',
  approved: 'Sua inscrição foi aprovada. Obrigado por se inscrever! A direção entrará em contato com os próximos passos.',
  rejected: 'Agradecemos o seu interesse. Neste momento não foi possível aprovar a sua inscrição.',
  waitlist: 'Recebemos a sua inscrição e ela foi aprovada, mas as vagas do seu instrumento estão preenchidas. Você ficou na lista de espera e a direção avisa se uma vaga abrir.',
}
const ALL_ON: Record<SendKey, boolean> = { privacy: true, send: true, confirmation: true, review: true, approved: true, rejected: true, waitlist: true }
export const SEND_FACTORY: SendTexts = { ...SEND_FALLBACK, on: ALL_ON }

const PARTS: Record<SendPart, SendKey[]> = { form: ['send', 'privacy', 'confirmation', 'review'], email: ['approved', 'rejected', 'waitlist'] }
const META: Record<SendKey, { label: string; rows: number; off: string; hint?: string }> = {
  send: { label: 'Antes de enviar (aparece na última etapa)', rows: 3, off: 'Nada aparece antes do botão de enviar.' },
  privacy: { label: 'Texto de privacidade (LGPD)', rows: 5, off: 'O formulário não mostra texto de privacidade.' },
  confirmation: { label: 'Depois de enviar (mensagem na tela)', rows: 2, off: 'Depois de enviar aparece só "Tudo certo!", sem mensagem.' },
  review: { label: 'Enquanto a direção avalia (tela de quem entrou com o Google)', rows: 3, off: 'Quem entra com o Google vê a mensagem padrão do sistema.' },
  approved: { label: 'E-mail de aprovação', rows: 4, off: 'Nenhum e-mail é enviado ao aprovar.', hint: 'Confirmação de que a inscrição foi aprovada. Não libera acesso por si só: o acesso segue por convite.' },
  rejected: { label: 'Texto-base da rejeição', rows: 4, off: 'Nenhum e-mail é enviado ao rejeitar.', hint: 'Ao rejeitar, a direção pode editar esta mensagem antes de enviar o e-mail.' },
  waitlist: { label: 'E-mail de lista de espera', rows: 4, off: 'Nenhum e-mail é enviado ao aprovar na lista de espera.', hint: 'Enviado quando a direção aprova a inscrição na lista de espera (vaga esgotada). Sem posição na fila: a direção escolhe quem entra por critérios próprios.' },
}

/** Colunas da tabela (forms e form_send_defaults) a partir dos textos, com o texto padrão quando um campo fica vazio. */
export const sendColumns = (f: SendTexts) => ({
  privacy_text: f.privacy.trim() || null, send_text: f.send.trim() || null, confirmation_message: f.confirmation.trim() || SEND_FALLBACK.confirmation,
  review_message: f.review.trim() || SEND_FALLBACK.review, approved_email_text: f.approved.trim() || SEND_FALLBACK.approved, rejected_email_text: f.rejected.trim() || SEND_FALLBACK.rejected,
  waitlist_email_text: f.waitlist.trim() || SEND_FALLBACK.waitlist,
  privacy_enabled: f.on.privacy, send_enabled: f.on.send, confirmation_enabled: f.on.confirmation, review_enabled: f.on.review,
  approved_enabled: f.on.approved, rejected_enabled: f.on.rejected, waitlist_enabled: f.on.waitlist,
})

/** Linha de `forms` ou de `form_send_defaults` (as colunas têm os mesmos nomes) → textos e chaves do editor. Sem linha: os padrões de fábrica. */
export function rowToSend(r: Record<string, unknown> | null | undefined): SendTexts {
  if (!r) return SEND_FACTORY
  const s = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb)
  const b = (v: unknown) => v !== false
  return {
    privacy: s(r.privacy_text, ''), send: s(r.send_text, ''), confirmation: s(r.confirmation_message, SEND_FALLBACK.confirmation), review: s(r.review_message, SEND_FALLBACK.review),
    approved: s(r.approved_email_text, SEND_FALLBACK.approved), rejected: s(r.rejected_email_text, SEND_FALLBACK.rejected), waitlist: s(r.waitlist_email_text, SEND_FALLBACK.waitlist),
    on: { privacy: b(r.privacy_enabled), send: b(r.send_enabled), confirmation: b(r.confirmation_enabled), review: b(r.review_enabled), approved: b(r.approved_enabled), rejected: b(r.rejected_enabled), waitlist: b(r.waitlist_enabled) },
  }
}

/** Troca só os textos (e chaves) da subpágina aberta pelos de `src`. */
export function restorePart(f: SendTexts, part: SendPart, src: SendTexts): SendTexts {
  const out: SendTexts = { ...f, on: { ...f.on } }
  for (const k of PARTS[part]) { out[k] = src[k]; out.on[k] = src.on[k] }
  return out
}

/** Subpáginas dos textos de envio: o que faz parte do formulário e o que é e-mail. */
export function SendPartTabs({ part, setPart, general }: { part: SendPart; setPart: (p: SendPart) => void; /** Formulário Geral: só a parte do formulário (sem e-mails de resultado). */ general?: boolean }) {
  if (general) return null
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Textos do envio">
      {([['form', 'Formulário', ClipboardList], ['email', 'E-mail', Mail]] as const).map(([k, label, Icon]) => (
        <Button key={k} type="button" role="tab" aria-selected={part === k} variant={part === k ? 'default' : 'outline'} onClick={() => setPart(k)}><Icon className="h-4 w-4" /> {label}</Button>
      ))}
    </div>
  )
}

/** Editor dos textos de uma subpágina: cada mensagem com seu checkbox; desligada, o campo some e fica só o aviso do que acontece. */
export function SendFields({ f, setF, prefix, part, disabled, general, consent, toggles = true }: { f: SendTexts; setF: (v: SendTexts) => void; prefix: string; part: SendPart; disabled?: boolean; general?: boolean; /** Só no formulário: exigir o aceite do texto de privacidade para enviar. */ consent?: { value: boolean; onChange: (v: boolean) => void }; /** Checkbox para ligar/desligar cada mensagem: só no formulário (os textos padrão sempre valem para todos). */ toggles?: boolean }) {
  return (
    <>
      {PARTS[part].filter((k) => !(general && k === 'review')).map((k) => {
        const m = META[k]
        return (
          <div key={k} className="space-y-1.5">
            <label className="flex items-center gap-2 font-semibold" htmlFor={`${prefix}-${k}-on`}>
              {toggles && <input id={`${prefix}-${k}-on`} type="checkbox" className="h-5 w-5 shrink-0" disabled={disabled} checked={f.on[k]} onChange={(e) => setF({ ...f, on: { ...f.on, [k]: e.target.checked } })} />}
              {part === 'email' && <Mail className="h-4 w-4 shrink-0" aria-hidden />}{m.label}
            </label>
            {f.on[k] || !toggles
              ? <><RichTextarea id={`${prefix}-${k}`} rows={m.rows} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} />{(k === 'send' || k === 'privacy') && <VarsHint />}{k === 'privacy' && consent && (
                <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={consent.value} onChange={(e) => consent.onChange(e.target.checked)} /> Exigir que a pessoa aceite para enviar (caixa “Li e concordo”)</label>
              )}{m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}</>
              : <p className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">Desligado. {m.off}</p>}
          </div>
        )
      })}
    </>
  )
}

/** Botão de restaurar da subpágina aberta: só os textos dela. `source` devolve os textos de origem (padrões das Configurações ou de fábrica). */
export function RestorePartButton({ f, setF, part, source }: { f: SendTexts; setF: (v: SendTexts) => void; part: SendPart; source: () => Promise<SendTexts> }) {
  return (
    <Button type="button" variant="outline" className="w-full" onClick={async () => {
      if (!(await confirmBox(`Substituir os textos de ${part === 'form' ? 'formulário' : 'e-mail'} pelos padrões?`))) return
      try { setF(restorePart(f, part, await source())); toast.success('Textos padrão colocados. Salve para aplicar.') } catch (e) { toast.error(friendlyError(e)) }
    }}><RotateCcw className="h-4 w-4" /> {part === 'form' ? 'Restaurar textos padrão de formulário' : 'Restaurar textos padrão de e-mail'}</Button>
  )
}

/** Card fixo "Envio" no fim da lista de campos: leva à aba Envio. */
export function SendSection({ onOpen }: { onOpen: () => void }) {
  return (
    <Card className="flex flex-wrap items-center gap-2 border-l-4 border-l-primary bg-muted/60 p-2.5">
      <Send className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <button className="min-w-0 flex-1 basis-40 text-left" onClick={onOpen}>
        <p className="font-display text-lg font-bold leading-tight">Envio</p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Badge>Seção fixa</Badge>
          <span>Textos de depois do envio, da avaliação e dos e-mails de aprovação, rejeição e lista de espera.</span>
        </p>
      </button>
      <Button size="sm" variant="outline" aria-label="Editar os textos do envio" title="Editar" onClick={onOpen}><Pencil className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Editar</span></Button>
    </Card>
  )
}

/** Aba Envio do formulário: os textos fixos do fim do formulário e dos e-mails. Valem na hora, sem republicar. */
export function SendTab({ form }: { form: FormRow }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const general = form.kind === 'general'
  const [part, setPart] = useState<SendPart>('form')
  const [f, setF] = useState<SendTexts>(() => rowToSend(form as unknown as Record<string, unknown>))
  const [requireConsent, setRequireConsent] = useState(form.requires_consent)
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('forms').update({ ...sendColumns(f), requires_consent: requireConsent }).eq('id', form.id); if (error) throw error },
    onSuccess: () => { toast.success('Textos do envio salvos.'); qc.invalidateQueries({ queryKey: ['form', orgId, form.id] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <form id="send-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <SendPartTabs part={part} setPart={setPart} general={general} />
      <SendFields f={f} setF={setF} prefix="sd" part={general ? 'form' : part} general={general} consent={{ value: requireConsent, onChange: setRequireConsent }} />
      <RestorePartButton f={f} setF={setF} part={general ? 'form' : part} source={async () => rowToSend((await loadSendDefaults(orgId)) as unknown as Record<string, unknown> | null)} />
      <StickySave><SaveButton type="submit" form="send-form" className="w-full" disabled={save.isPending} hint="Salvar textos do envio" /></StickySave>
    </form>
  )
}
