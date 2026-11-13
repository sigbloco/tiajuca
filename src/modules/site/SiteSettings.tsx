import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { UnsavedGuard } from '@/components/shared/UnsavedGuard'
import { Button, Card, Input, Label, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { LINK_KINDS, hrefOf, youtubeId, type LinkKind, type SiteLink, type SiteVideo } from './links'

interface SiteRow {
  headline: string | null; description: string | null; photo_url: string | null; links: SiteLink[]; videos: SiteVideo[]
  enrollment_label: string; shop_label: string; login_label: string; show_shop: boolean; show_enrollment: boolean; show_login: boolean; shake_button: 'enrollment' | 'shop' | 'login' | null; hide_headline: boolean; header_color: string | null; page_color: string | null
}
const EMPTY: SiteRow = { headline: null, description: null, photo_url: null, links: [], videos: [], enrollment_label: 'Inscrições da oficina', shop_label: 'Loja', login_label: 'Área dos integrantes', show_shop: true, show_enrollment: true, show_login: true, shake_button: null, hide_headline: false, header_color: null, page_color: null }

/** Editor da página inicial pública (a que as pessoas veem em "/"). Só Direção/Titular. */
export function SiteSettings() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['site-settings', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('*').eq('organization_id', orgId).maybeSingle()
      if (error) throw error
      return (data ?? null) as (SiteRow & { organization_id: string }) | null
    },
  })
  const [f, setF] = useState<SiteRow>(EMPTY)
  useEffect(() => { if (!isLoading) setF({ ...EMPTY, ...(data ?? {}), links: data?.links ?? [], videos: data?.videos ?? [] }) }, [data, isLoading])
  const saved = { ...EMPTY, ...(data ?? {}), links: data?.links ?? [], videos: data?.videos ?? [] }
  const dirty = JSON.stringify(f) !== JSON.stringify(saved)

  const write = async (row: SiteRow) => {
    const { error } = await supabase.from('site_settings').upsert({
      organization_id: orgId, headline: row.headline?.trim() || null, description: row.description?.trim() || null, photo_url: row.photo_url,
      links: row.links, videos: row.videos, enrollment_label: row.enrollment_label.trim() || EMPTY.enrollment_label,
      shop_label: row.shop_label.trim() || EMPTY.shop_label, login_label: row.login_label.trim() || EMPTY.login_label, show_shop: row.show_shop, show_enrollment: row.show_enrollment, show_login: row.show_login, shake_button: row.shake_button, hide_headline: row.hide_headline, header_color: row.header_color, page_color: row.page_color,
    }, { onConflict: 'organization_id' })
    if (error) throw error
  }
  const refresh = () => { qc.invalidateQueries({ queryKey: ['site-settings', orgId] }); qc.invalidateQueries({ queryKey: ['public-site'] }) }
  const save = useMutation({
    mutationFn: () => write(f),
    onSuccess: () => {
      const before = saved
      refresh()
      notifySaved('Página inicial salva.', async () => { await write(before); refresh() })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) throw new Error('Use uma imagem SVG, PNG, JPG ou WebP.')
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB.')
      const ext = file.type.includes('svg') ? 'svg' : file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg'
      const path = `${orgId}/foto-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('site-public').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      return supabase.storage.from('site-public').getPublicUrl(path).data.publicUrl
    },
    onSuccess: (url) => setF((x) => ({ ...x, photo_url: url })),
    onError: (e) => toast.error(friendlyError(e)),
  })

  const setLink = (i: number, p: Partial<SiteLink>) => setF((x) => ({ ...x, links: x.links.map((l, k) => (k === i ? { ...l, ...p } : l)) }))
  const moveLink = (i: number, d: number) => setF((x) => { const a = [...x.links]; const [it] = a.splice(i, 1); a.splice(i + d, 0, it); return { ...x, links: a } })
  const setVideo = (i: number, p: Partial<SiteVideo>) => setF((x) => ({ ...x, videos: x.videos.map((v, k) => (k === i ? { ...v, ...p } : v)) }))

  if (isLoading) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Página inicial do site</h2>
        <a className="inline-flex items-center gap-1 font-semibold text-primary underline" href="/site" target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Ver a página</a>
      </div>
      <UnsavedGuard dirty={dirty} onSave={() => save.mutateAsync()} />
      <p className="text-muted-foreground">É a página que as pessoas veem ao abrir o endereço do site (antes de entrar): foto, descrição, redes e contatos, menu e vídeos.</p>

      <Card className="p-4 text-sm">As <strong>cores</strong> do sistema, da página inicial e da loja (cabeçalho, fundo, botões) agora ficam em <Link className="font-semibold text-primary underline" to={`/${membership?.slug}/interface`}>Interface</Link>.</Card>

      <Card className="space-y-3 p-4">
        <h3>Cabeçalho</h3>
        <div className="flex flex-wrap items-center gap-3">
          <img src={f.photo_url || membership?.logo_path || '/brand/tiajuca.png'} alt="Foto da página" className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher foto"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} />
            <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {upload.isPending ? 'Enviando' : 'Trocar foto'}</Button>
            {f.photo_url && <Button type="button" variant="ghost" onClick={() => setF({ ...f, photo_url: null })}>Usar a logo do bloco</Button>}
            <p className="text-xs text-muted-foreground">SVG, PNG, JPG ou WebP, até 5 MB. Aparece em círculo.</p>
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="st-head">Título</Label>
          <Input id="st-head" placeholder={membership?.name ?? 'Nome do bloco'} value={f.headline ?? ''} onChange={(e) => setF({ ...f, headline: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.hide_headline} onChange={(e) => setF({ ...f, hide_headline: e.target.checked })} /> Esconder o título na página</label>
          <p className="text-xs text-muted-foreground">Só a logo aparece. O título continua no código da página, para buscadores (SEO) e leitores de tela.</p></div>
        <div className="space-y-1.5"><Label htmlFor="st-desc">Descrição curta</Label>
          <textarea id="st-desc" rows={4} maxLength={600} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <p className="text-xs text-muted-foreground">{(f.description ?? '').length}/600</p></div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3>Redes sociais e contatos</h3>
        <p className="text-xs text-muted-foreground">Aparecem como botões redondos, lado a lado. Digite só o número, o @ ou o endereço: o link é montado sozinho.</p>
        {f.links.map((l, i) => {
          const ok = !l.value.trim() || !!hrefOf(l)
          return (
            <div key={i} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Select className="w-36" aria-label="Tipo" value={l.kind} onChange={(e) => setLink(i, { kind: e.target.value as LinkKind })}>
                  {Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
                <Input className="min-w-44 flex-1" aria-label="Número, @ ou endereço" placeholder={LINK_KINDS[l.kind].placeholder} value={l.value} onChange={(e) => setLink(i, { value: e.target.value })} />
                <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => moveLink(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={i === f.links.length - 1} onClick={() => moveLink(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => setF({ ...f, links: f.links.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {!ok && <p className="text-xs text-destructive">Esse valor não forma um link válido para {LINK_KINDS[l.kind].label}.</p>}
            </div>
          )
        })}
        <Button type="button" variant="outline" disabled={f.links.length >= 20} onClick={() => setF({ ...f, links: [...f.links, { kind: 'whatsapp', label: '', value: '' }] })}><Plus className="h-4 w-4" /> Adicionar rede ou contato</Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h3>Menu</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            { key: 'enrollment', id: 'st-enr', label: 'Botão das inscrições', text: f.enrollment_label, on: f.show_enrollment, set: (v: string) => ({ enrollment_label: v }), toggle: () => ({ show_enrollment: !f.show_enrollment }) },
            { key: 'shop', id: 'st-shop', label: 'Nome da loja (menu, site e vitrine)', text: f.shop_label, on: f.show_shop, set: (v: string) => ({ shop_label: v }), toggle: () => ({ show_shop: !f.show_shop }) },
            { key: 'login', id: 'st-login', label: 'Botão de acesso', text: f.login_label, on: f.show_login, set: (v: string) => ({ login_label: v }), toggle: () => ({ show_login: !f.show_login }) },
          ] as const).map((b) => (
            <div key={b.key} className="space-y-1.5">
              <Label htmlFor={b.id}>{b.label}</Label>
              <div className="flex items-center gap-2">
                <button type="button" aria-pressed={b.on} aria-label={b.on ? 'Botão visível no site (clique para ocultar)' : 'Botão oculto no site (clique para mostrar)'} title={b.on ? 'Visível no site' : 'Oculto no site'}
                  onClick={() => setF({ ...f, ...b.toggle() })}
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border ${b.on ? 'bg-card text-foreground' : 'bg-muted text-muted-foreground'} hover:bg-muted`}>
                  {b.on ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
                <Input id={b.id} className="min-w-0 flex-1" value={b.text} onChange={(e) => setF({ ...f, ...b.set(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.shake_button === b.key} onChange={(e) => setF({ ...f, shake_button: e.target.checked ? b.key : null })} /> Tremer para chamar atenção</label>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3>Vídeos do YouTube</h3>
        {f.videos.map((v, i) => {
          const ok = !v.url.trim() || !!youtubeId(v.url)
          return (
            <div key={i} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="min-w-56 flex-1" aria-label="Endereço do vídeo" placeholder="https://www.youtube.com/watch?v=" value={v.url} onChange={(e) => setVideo(i, { url: e.target.value })} />
                <Input className="w-56" aria-label="Título" placeholder="Título" value={v.title} onChange={(e) => setVideo(i, { title: e.target.value })} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remover vídeo" onClick={() => setF({ ...f, videos: f.videos.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {!ok && <p className="text-xs text-destructive">Cole o endereço de um vídeo do YouTube.</p>}
            </div>
          )
        })}
        <Button type="button" variant="outline" disabled={f.videos.length >= 12} onClick={() => setF({ ...f, videos: [...f.videos, { url: '', title: '' }] })}><Plus className="h-4 w-4" /> Adicionar vídeo</Button>
      </Card>

      <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
        <Button disabled={!dirty || save.isPending || f.links.some((l) => l.value.trim() && !hrefOf(l)) || f.videos.some((v) => v.url.trim() && !youtubeId(v.url))} onClick={() => {
          setF((x) => ({ ...x, links: x.links.filter((l) => l.value.trim()), videos: x.videos.filter((v) => v.url.trim()) }))
          save.mutate()
        }} aria-label="Salvar página" title="Salvar página"><Save className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
