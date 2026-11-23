import { requireFields } from '@/core/required'
import { SaveButton } from '@/components/shared/SaveButton'
import { StickySave } from '@/components/shared/StickySave'
import { RichTextarea } from '@/components/shared/RichText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, Rocket, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCycles } from '@/modules/cycles/service'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { HeaderBand } from './HeaderBand'
import { ColorPick } from '@/modules/site/ColorPick'
import { resolveColors } from '@/core/themeModel'

/** Cor do cabeçalho quando o formulário ainda não tem uma: a cor principal do bloco (tema), ou um cinza neutro. */
const NEUTRAL_HEADER = '#3C3C3C'
import { FORM_STATUS_CLASS, FORM_STATUS_LABEL, kindFlags, publicUrl, slugify, type FormKind, type FormRow, type FormStatus } from './service'

// Horário de Brasília (sem horário de verão em vigor): abre às 00:00 e encerra às 23:59 do dia escolhido.
const toTs = (date: string, end: boolean) => (date ? `${date}T${end ? '23:59:00' : '00:00:00'}-03:00` : null)
const toDate = (ts: string | null) => (ts ? new Date(new Date(ts).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : '')

/** Duas abas do editor: `main` (título, ciclo, datas, endereço, situação) e `header` (cabeçalho, descrição, privacidade e opções de envio). */
export function SettingsTab({ form, part = 'main' }: { form: FormRow; part?: 'main' | 'header' }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const DEFAULT_HEADER = resolveColors(membership?.theme, 'general').primary ?? NEUTRAL_HEADER
  const qc = useQueryClient()
  const cycles = useCycles()
  const [f, setF] = useState({
    kind: form.kind, access: form.access ?? 'public', title: form.title, description: form.description ?? '', slug: form.slug, cycle_id: form.cycle_id ?? '',
    opens: toDate(form.opens_at), closes: toDate(form.closes_at),
    privacy: form.privacy_text ?? '', headerImage: form.header_image_url ?? '', hx: Number(form.header_pos_x), hy: Number(form.header_pos_y), hzoom: Number(form.header_zoom), hheight: form.header_height, hlogo: form.header_logo_size ?? 80, hcolor: form.header_color ?? DEFAULT_HEADER, hmode: (form.header_color && !form.header_image_url ? 'color' : 'photo') as 'photo' | 'color', consent: form.requires_consent, dedupe: form.prevent_duplicates,
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['form', orgId, form.id] }); qc.invalidateQueries({ queryKey: ['forms', orgId] }) }
  const save = useMutation({
    mutationFn: async () => {
      const patch = part === 'main'
        ? { title: f.title.trim(), kind: f.kind, access: f.access, ...(f.kind !== form.kind ? kindFlags(f.kind) : {}), slug: f.slug, cycle_id: f.cycle_id || null, opens_at: toTs(f.opens, false), closes_at: toTs(f.closes, true), max_responses: null }
        : { description: f.description.trim() || null, header_image_url: f.hmode === 'photo' ? f.headerImage || null : null, header_color: f.hmode === 'color' ? f.hcolor : null, header_pos_x: f.hx, header_pos_y: f.hy, header_zoom: f.hzoom, header_height: f.hheight, header_logo_size: f.hlogo, prevent_duplicates: f.dedupe }
      const { error } = await supabase.from('forms').update(patch
      ).eq('id', form.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Configurações salvas. Republique para aplicar ao link público.'); refresh() },
    onError: (e) => toast.error(/23505|duplicate/i.test(JSON.stringify(e)) ? 'Já existe um formulário com este endereço.' : /check/i.test(JSON.stringify(e)) ? 'Confira as datas: o encerramento deve ser depois da abertura.' : friendlyError(e)),
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.')
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB.')
      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg'
      const path = `${orgId}/formulario-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('site-public').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      return supabase.storage.from('site-public').getPublicUrl(path).data.publicUrl
    },
    onSuccess: (url) => setF((x) => ({ ...x, headerImage: url, hx: 50, hy: 50, hzoom: 1 })),
    onError: (e) => toast.error(friendlyError(e)),
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
  const previewUrl = membership ? `${window.location.origin}/${membership.slug}/previa/${form.id}` : ''
  const copyPreview = async () => { try { await navigator.clipboard.writeText(previewUrl); toast.success('Link de pré-visualização copiado.') } catch { toast.error('Não foi possível copiar.') } }
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success('Link copiado.') } catch { toast.error('Não foi possível copiar.') } }

  return (
    <div className="space-y-4">
      {part === 'main' ? (
        <>
          <form id="fs-main" onSubmit={(e) => { e.preventDefault(); if (requireFields([['Título', f.title.trim()], ['Endereço do formulário', f.slug]])) save.mutate() }} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="fs-kind">Tipo</Label>
          <Select id="fs-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as FormKind })}><option value="enrollment">Inscrição (com avaliação e aprovação)</option><option value="general">Geral (enquete, pedido…)</option></Select>
          {f.kind === 'general' && <p className="text-xs text-muted-foreground">Sem avaliação nem aprovação: as respostas só chegam e podem ser arquivadas. Os e-mails de resultado ficam desligados.</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="fs-access">Quem pode responder</Label>
          <Select id="fs-access" value={f.access} onChange={(e) => setF({ ...f, access: e.target.value as 'public' | 'internal' })}><option value="public">Público (qualquer pessoa, aceita inscrições novas)</option><option value="internal">Interno (só integrantes, com login Google)</option></Select>
          {f.access === 'internal' && <p className="text-xs text-muted-foreground">Quem entra sem cadastro vê um aviso e não responde. O formulário já vem preenchido com os dados do integrante, e cada seção pode aparecer só para um naipe (em cada seção, “Mostrar somente se”). A resposta vira pendência: ao aprovar, o cadastro existente é atualizado.</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="fs-title" required>Título</Label><Input id="fs-title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="fs-cycle">Ciclo relacionado</Label>
            <Select id="fs-cycle" value={f.cycle_id} onChange={(e) => setF({ ...f, cycle_id: e.target.value })}><option value="">Nenhum</option>{cycles.data?.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label htmlFor="fs-open">Abre em</Label><DateInput id="fs-open" value={f.opens} onChange={(v) => setF({ ...f, opens: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="fs-close">Encerra em</Label><DateInput id="fs-close" min={f.opens || undefined} value={f.closes} onChange={(v) => setF({ ...f, closes: v })} /></div>
        </div>

        <div className="space-y-1.5"><Label htmlFor="fs-slug" required>Endereço (final do link)</Label><Input id="fs-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
          <p className="text-xs text-muted-foreground">{membership ? publicUrl(membership.slug, f.slug || '—') : ''} · Mudar o endereço quebra links já divulgados.</p></div>
          </form>
      <Card className="space-y-2 p-4">
        <div className="flex items-center gap-2"><h3>Situação</h3><Badge className={FORM_STATUS_CLASS[form.status]}>{FORM_STATUS_LABEL[form.status]}</Badge></div>
        {form.status !== 'draft' && <div className="flex items-center gap-2"><Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" aria-label="Copiar link" onClick={copy}><Copy className="h-4 w-4" /></Button></div>}
        <div className="space-y-1.5">
          <Label htmlFor="fs-preview">Link de pré-visualização</Label>
          <div className="flex items-center gap-2">
            <Input id="fs-preview" readOnly value={previewUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" aria-label="Copiar link de pré-visualização" title="Copiar" onClick={copyPreview}><Copy className="h-4 w-4" /></Button>
            <Button asChild variant="outline" size="icon" aria-label="Abrir a pré-visualização" title="Abrir"><a href={previewUrl} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /></a></Button>
          </div>
          <p className="text-xs text-muted-foreground">Mostra o formulário como está agora (mesmo rascunho), sem enviar nada. Só abre para quem tem acesso ao sistema.</p>
        </div>
        <ButtonRow>
          <Button disabled={publish.isPending || form.status === 'archived'} onClick={() => publish.mutate()}><Rocket className="h-4 w-4" /> {form.published_version_id ? 'Publicar nova versão' : 'Publicar'}</Button>
          {form.status === 'published' && <Button variant="outline" onClick={() => setStatus.mutate('closed')}>Encerrar inscrições</Button>}
          {form.status === 'closed' && <Button variant="outline" onClick={() => setStatus.mutate('published')}>Reabrir</Button>}
          {form.status !== 'archived' && <Button variant="ghost" onClick={async () => { if (await confirmBox('Apagar este formulário? Ele vai para a lixeira (em Inscrições), o link deixa de funcionar e as respostas são mantidas.')) setStatus.mutate('archived') }}>Arquivar</Button>}
          {form.status === 'archived' && <Button variant="outline" onClick={() => setStatus.mutate('draft')}>Restaurar como rascunho</Button>}
        </ButtonRow>
        <p className="text-xs text-muted-foreground">Ao publicar, é gravada uma cópia fixa do formulário (versão). Quem respondeu continua com a versão em que respondeu.</p>
      </Card>
          <StickySave><SaveButton type="submit" form="fs-main" className="w-full" disabled={save.isPending} hint="Salvar configurações" /></StickySave>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Fundo do cabeçalho">
            <Button type="button" variant={f.hmode === 'photo' ? 'default' : 'outline'} onClick={() => setF({ ...f, hmode: 'photo' })}>Foto</Button>
            <Button type="button" variant={f.hmode === 'color' ? 'default' : 'outline'} onClick={() => setF({ ...f, hmode: 'color' })}>Cor chapada</Button>
          </div>
          <HeaderBand frame={{ image_url: f.hmode === 'photo' ? f.headerImage || null : null, color: f.hmode === 'color' ? f.hcolor : null, x: f.hx, y: f.hy, zoom: f.hzoom, height: f.hheight, logo: f.hlogo }}
            onChange={(p) => setF((x) => ({ ...x, hx: Math.round(p.x * 10) / 10, hy: Math.round(p.y * 10) / 10 }))}
            logo={<OrgLogo name={membership?.name ?? ''} logoPath={membership?.logo_path ?? null} className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]" style={{ width: f.hlogo, height: f.hlogo }} />} />
          <p className="text-xs text-muted-foreground">{f.hmode === 'color' ? 'Prévia do cabeçalho com a cor escolhida atrás da logo.' : f.headerImage ? 'Prévia de como fica no formulário. Arraste a foto para posicioná-la na moldura.' : 'Prévia do cabeçalho. Escolha uma foto para ficar atrás da logo.'}</p>
          {f.hmode === 'color' && <ColorPick label="Cor do cabeçalho" area="general" value={f.hcolor} onChange={(v) => setF({ ...f, hcolor: v ?? DEFAULT_HEADER })} />}
          <div className="grid gap-3 sm:grid-cols-2">
            {f.hmode === 'photo' && f.headerImage && (
              <div className="space-y-1"><Label htmlFor="fs-zoom">Tamanho da foto ({Math.round(f.hzoom * 100)}%)</Label>
                <input id="fs-zoom" type="range" min={1} max={4} step={0.05} value={f.hzoom} className="w-full accent-primary" onChange={(e) => setF({ ...f, hzoom: Number(e.target.value) })} /></div>
            )}
            <div className="space-y-1"><Label htmlFor="fs-logo">Tamanho da logo ({f.hlogo} px)</Label>
              <input id="fs-logo" type="range" min={32} max={Math.max(64, f.hheight)} step={4} value={Math.min(f.hlogo, Math.max(64, f.hheight))} className="w-full accent-primary" onChange={(e) => setF({ ...f, hlogo: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label htmlFor="fs-height">Altura do cabeçalho ({f.hheight} px)</Label>
              <input id="fs-height" type="range" min={64} max={320} step={4} value={f.hheight} className="w-full accent-primary" onChange={(e) => setF({ ...f, hheight: Number(e.target.value) })} /></div>
          </div>
          {f.hmode === 'photo' && <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} />
            <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {upload.isPending ? 'Enviando' : f.headerImage ? 'Trocar foto' : 'Escolher foto'}</Button>
            {f.headerImage && <Button type="button" variant="outline" onClick={() => setF({ ...f, hx: 50, hy: 50, hzoom: 1 })}>Centralizar</Button>}
            {f.headerImage && <Button type="button" variant="ghost" onClick={() => setF({ ...f, headerImage: '' })}>Remover foto</Button>}
          </div>}
          <p className="text-xs text-muted-foreground">Vale na hora, sem republicar. Salve para aplicar.</p>
        </div>

        <div className="space-y-1.5"><Label htmlFor="fs-desc">Descrição</Label>
          <RichTextarea id="fs-desc" rows={3} value={f.description} onChange={(v) => setF({ ...f, description: v })} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.dedupe} onChange={(e) => setF({ ...f, dedupe: e.target.checked })} /> Impedir envio duplicado (mesmo e-mail)</label>
        <StickySave><SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar configurações" /></StickySave>
        </form>
      )}

    </div>
  )
}
