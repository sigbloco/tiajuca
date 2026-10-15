import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Rocket } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCycles } from '@/modules/cycles/service'
import { FORM_STATUS_CLASS, FORM_STATUS_LABEL, publicUrl, slugify, type FormRow, type FormStatus } from './service'

// Horário de Brasília (sem horário de verão em vigor): abre às 00:00 e encerra às 23:59 do dia escolhido.
const toTs = (date: string, end: boolean) => (date ? `${date}T${end ? '23:59:00' : '00:00:00'}-03:00` : null)
const toDate = (ts: string | null) => (ts ? new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : '')

export function SettingsTab({ form }: { form: FormRow }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const cycles = useCycles()
  const [f, setF] = useState({
    title: form.title, description: form.description ?? '', slug: form.slug, cycle_id: form.cycle_id ?? '',
    opens: toDate(form.opens_at), closes: toDate(form.closes_at), confirmation: form.confirmation_message, max: form.max_responses?.toString() ?? '',
    privacy: form.privacy_text ?? '', consent: form.requires_consent, dedupe: form.prevent_duplicates,
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['form', orgId, form.id] }); qc.invalidateQueries({ queryKey: ['forms', orgId] }) }
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('forms').update({
        title: f.title.trim(), description: f.description.trim() || null, slug: f.slug, cycle_id: f.cycle_id || null,
        opens_at: toTs(f.opens, false), closes_at: toTs(f.closes, true), confirmation_message: f.confirmation.trim() || 'Inscrição recebida!',
        max_responses: f.max ? Number(f.max) : null, privacy_text: f.privacy.trim() || null, requires_consent: f.consent, prevent_duplicates: f.dedupe,
      }).eq('id', form.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Configurações salvas. Republique para aplicar ao link público.'); refresh() },
    onError: (e) => toast.error(/23505|duplicate/i.test(JSON.stringify(e)) ? 'Já existe um formulário com este endereço.' : /check/i.test(JSON.stringify(e)) ? 'Confira as datas: o encerramento deve ser depois da abertura.' : friendlyError(e)),
  })
  const publish = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('publish_form', { p_form: form.id }); if (error) throw error },
    onSuccess: () => { toast.success('Publicado! Uma nova versão do formulário está no ar.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const setStatus = useMutation({
    mutationFn: async (status: FormStatus) => { const { error } = await supabase.from('forms').update({ status }).eq('id', form.id); if (error) throw error },
    onSuccess: refresh, onError: (e) => toast.error(friendlyError(e)),
  })
  const url = membership ? publicUrl(membership.slug, form.slug) : ''
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success('Link copiado.') } catch { toast.error('Não foi possível copiar.') } }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between"><h3>Situação</h3><Badge className={FORM_STATUS_CLASS[form.status]}>{FORM_STATUS_LABEL[form.status]}</Badge></div>
        {form.status !== 'draft' && <div className="flex items-center gap-2"><Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" aria-label="Copiar link" onClick={copy}><Copy className="h-4 w-4" /></Button></div>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={publish.isPending || form.status === 'archived'} onClick={() => publish.mutate()}><Rocket className="h-4 w-4" /> {form.published_version_id ? 'Publicar nova versão' : 'Publicar'}</Button>
          {form.status === 'published' && <Button variant="outline" onClick={() => setStatus.mutate('closed')}>Encerrar inscrições</Button>}
          {form.status === 'closed' && <Button variant="outline" onClick={() => setStatus.mutate('published')}>Reabrir</Button>}
          {form.status !== 'archived' && <Button variant="ghost" onClick={() => { if (window.confirm('Arquivar este formulário? O link deixa de funcionar e as respostas são mantidas.')) setStatus.mutate('archived') }}>Arquivar</Button>}
          {form.status === 'archived' && <Button variant="outline" onClick={() => setStatus.mutate('draft')}>Voltar para rascunho</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Ao publicar, é gravada uma cópia fixa do formulário (versão). Quem respondeu continua com a versão em que respondeu.</p>
      </Card>

      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="fs-title">Título</Label><Input id="fs-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="fs-desc">Descrição</Label>
          <textarea id="fs-desc" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="fs-slug">Endereço (final do link)</Label><Input id="fs-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Mudar o endereço quebra links já divulgados.</p></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="fs-cycle">Ciclo relacionado</Label>
            <Select id="fs-cycle" value={f.cycle_id} onChange={(e) => setF({ ...f, cycle_id: e.target.value })}><option value="">Nenhum</option>{cycles.data?.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label htmlFor="fs-open">Abre em</Label><DateInput id="fs-open" value={f.opens} onChange={(v) => setF({ ...f, opens: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="fs-close">Encerra em</Label><DateInput id="fs-close" min={f.opens || undefined} value={f.closes} onChange={(v) => setF({ ...f, closes: v })} /></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="fs-max">Limite de respostas (opcional)</Label><Input id="fs-max" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="space-y-1.5"><Label htmlFor="fs-conf">Mensagem após o envio</Label><Input id="fs-conf" value={f.confirmation} onChange={(e) => setF({ ...f, confirmation: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="fs-priv">Texto de privacidade (LGPD)</Label>
          <textarea id="fs-priv" rows={5} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" value={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.value })} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /> Exigir consentimento para enviar</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.dedupe} onChange={(e) => setF({ ...f, dedupe: e.target.checked })} /> Impedir envio duplicado (mesmo e-mail)</label>
        <Button type="submit" disabled={!f.title.trim() || !f.slug || save.isPending}>Salvar configurações</Button>
      </form>
    </div>
  )
}
