import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, Palette, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { listProducts } from '@/modules/shop/admin/service'
import { AlbumsTab } from './AlbumsTab'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useProgressive } from '@/components/shared/LoadMore'
import { useHoldReorder } from '@/core/holdReorder'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { useRememberedState } from '@/core/rememberedState'
import { Button, Card, Input, Label, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { LINK_KINDS, hrefOf, youtubeId, type LinkKind, type SiteLink, type SiteVideo } from './links'

const TABS = [{ key: 'header', label: 'Cabeçalho' }, { key: 'menu', label: 'Menu' }, { key: 'albums', label: 'Fotos' }, { key: 'videos', label: 'Vídeos' }] as const
type TabKey = (typeof TABS)[number]['key']
type MenuKey = 'enrollment' | 'shop' | 'login' | 'albums' | 'release'
const MENU_DEFAULT: MenuKey[] = ['enrollment', 'shop', 'albums', 'release', 'login']
/** Ordem salva (completa e sem repetição); o que faltar vai para o fim. */
const menuOrder = (o?: string[] | null): MenuKey[] => [...(o ?? []).filter((k): k is MenuKey => MENU_DEFAULT.includes(k as MenuKey)).filter((k, i, a) => a.indexOf(k) === i), ...MENU_DEFAULT.filter((k) => !(o ?? []).includes(k))]

interface SiteRow {
  headline: string | null; description: string | null; photo_url: string | null; links: SiteLink[]; videos: SiteVideo[]
  enrollment_label: string; shop_label: string; login_label: string; show_shop: boolean; show_enrollment: boolean; show_login: boolean; menu_construction: string[]; shop_product_id: string | null; show_albums: boolean; albums_label: string; show_release: boolean; release_label: string; release_url: string | null; shake_button: 'enrollment' | 'shop' | 'login' | 'albums' | 'release' | null; menu_order: string[]; hide_headline: boolean; header_color: string | null; page_color: string | null
}
const EMPTY: SiteRow = { headline: null, description: null, photo_url: null, links: [], videos: [], enrollment_label: 'Inscrições da oficina', shop_label: 'Loja', login_label: 'Área dos integrantes', albums_label: 'Fotos', show_albums: true, show_release: true, release_label: 'Release', release_url: null, show_shop: true, show_enrollment: true, show_login: true, menu_construction: [], shop_product_id: null, shake_button: null, menu_order: MENU_DEFAULT, hide_headline: false, header_color: null, page_color: null }

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
  // Produtos que podem ser ligados ao botão da loja (ativos e não ocultos).
  const products = useQuery({ queryKey: ['site-shop-products', orgId], queryFn: () => listProducts(orgId) })
  const pickable = (products.data ?? []).filter((p) => p.is_active && !p.is_hidden)
  const [f, setF] = useState<SiteRow>(EMPTY)
  // Carrega uma vez; depois o que está na tela é a verdade (salvamento automático não pode apagar o que a pessoa está digitando).
  const loaded = useRef(false)
  useEffect(() => { if (!isLoading && !loaded.current) { loaded.current = true; setF({ ...EMPTY, ...(data ?? {}), links: data?.links ?? [], videos: data?.videos ?? [] }) } }, [data, isLoading])
  const saved = { ...EMPTY, ...(data ?? {}), links: data?.links ?? [], videos: data?.videos ?? [] }
  const invalid = (!!f.release_url?.trim() && !/^https:\/\//i.test(f.release_url.trim())) || f.links.some((l) => l.value.trim() && !hrefOf(l)) || f.videos.some((v) => v.url.trim() && !youtubeId(v.url))

  const payload = (row: SiteRow) => ({
    headline: row.headline?.trim() || null, description: row.description?.trim() || null, photo_url: row.photo_url ?? null,
    links: row.links.filter((l) => l.value.trim()), videos: row.videos.filter((v) => v.url.trim()),
    enrollment_label: row.enrollment_label.trim() || EMPTY.enrollment_label, shop_label: row.shop_label.trim() || EMPTY.shop_label,
    login_label: row.login_label.trim() || EMPTY.login_label, albums_label: (row.albums_label ?? '').trim() || EMPTY.albums_label,
    show_shop: row.show_shop, show_enrollment: row.show_enrollment, show_login: row.show_login, menu_construction: [...(row.menu_construction ?? [])].sort(), shop_product_id: row.shop_product_id ?? null, show_albums: row.show_albums, show_release: row.show_release, release_label: (row.release_label ?? '').trim() || EMPTY.release_label, release_url: row.release_url?.trim() || null,
    shake_button: row.shake_button ?? null, menu_order: menuOrder(row.menu_order), hide_headline: row.hide_headline,
    header_color: row.header_color ?? null, page_color: row.page_color ?? null,
  })
  const write = async (row: SiteRow) => {
    const { error } = await supabase.from('site_settings').upsert({ organization_id: orgId, ...payload(row) }, { onConflict: 'organization_id' })
    if (error) throw error
  }
  // Linhas vazias (recém-adicionadas) não contam nem vão para o banco.
  const dirty = JSON.stringify(payload(f)) !== JSON.stringify(payload(saved))
  const refresh = () => { qc.invalidateQueries({ queryKey: ['site-settings', orgId] }); qc.invalidateQueries({ queryKey: ['public-site'] }) }
  const save = useMutation({
    mutationFn: () => write(f),
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Salva sozinho, 0,8 s depois da última alteração (links e vídeos inválidos esperam ser corrigidos).
  useEffect(() => {
    if (!loaded.current || !dirty || invalid || save.isPending) return
    const t = setTimeout(() => save.mutate(), 800)
    return () => clearTimeout(t)
  }, [JSON.stringify(f), dirty, invalid, save.isPending]) // eslint-disable-line react-hooks/exhaustive-deps
  // Saindo da página com algo pendente: salva na hora.
  const latest = useRef({ f, dirty, invalid })
  latest.current = { f, dirty, invalid }
  useEffect(() => () => { const c = latest.current; if (c.dirty && !c.invalid) void write(c.f).then(refresh) }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
  const moveVideo = (i: number, d: number) => setF((x) => { const a = [...x.videos]; const [it] = a.splice(i, 1); a.splice(i + d, 0, it); return { ...x, videos: a } })
  // Arrastar pela alça: o id da linha é o índice (escopo "links" ou "videos").
  const dnd = useHoldReorder()
  const dragLink = (from: string, to: string) => moveLink(Number(from), Number(to) - Number(from))
  const moveMenu = (i: number, d: number) => setF((x) => { const a = menuOrder(x.menu_order); const [it] = a.splice(i, 1); a.splice(i + d, 0, it); return { ...x, menu_order: a } })
  const dragMenu = (from: string, to: string) => moveMenu(Number(from), Number(to) - Number(from))
  const vids = useProgressive(f.videos, 3)
  const dragVideo = (from: string, to: string) => moveVideo(Number(from), Number(to) - Number(from))
  const [tab, setTab] = useRememberedState<TabKey>('site-aba', 'header', TABS.map((t) => t.key))
  useRegisterCrumb(TABS.find((t) => t.key === tab)!.label, () => setTab('header'), true, 0)

  /** Alça de arrastar + setas (uma acima da outra), como nas variações do produto. */
  const reorderCol = (id: string, i: number, total: number, move: (i: number, d: number) => void, drag: (f: string, t: string) => void, scope: string, what: string) => (
    <div className="flex flex-col items-center">
      <Button type="button" size="icon" variant="ghost" className="h-6 w-7" aria-label={`Subir ${what}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
      {dnd.handle(id, drag, scope)}
      <Button type="button" size="icon" variant="ghost" className="h-6 w-7" aria-label={`Descer ${what}`} disabled={i === total - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
    </div>
  )

  if (isLoading) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0">Página inicial do site</h2>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" className="min-h-11 min-w-11 px-3">
            <a href="/site" target="_blank" rel="noreferrer" aria-label="Ver a página" title="Ver a página"><ExternalLink className="h-5 w-5" /><span className="ml-2 hidden md:inline">Ver a página</span></a>
          </Button>
          <Button asChild variant="outline" size="icon" className="min-h-11 min-w-11">
            <Link to={`/${membership?.slug}/interface?area=site`} aria-label="Interface (cores)" title="Interface (cores)"><Palette className="h-5 w-5" /></Link>
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">É a página que as pessoas veem ao abrir o endereço do site (antes de entrar): foto, descrição, redes e contatos, menu e vídeos.</p>

      <p role="status" className="text-xs text-muted-foreground">{save.isPending ? 'Salvando…' : invalid ? 'Corrija o link destacado para salvar.' : dirty ? 'Salvando em instantes…' : 'Tudo salvo automaticamente.'}</p>

      <ButtonRow role="tablist" aria-label="Seções da página inicial">
        {TABS.map((t) => (
          <Button key={t.key} role="tab" aria-selected={tab === t.key} variant={tab === t.key ? 'default' : 'outline'} className="min-h-11" onClick={() => setTab(t.key)}>{t.label}</Button>
        ))}
      </ButtonRow>

      {tab === 'header' && (
      <Card className="space-y-3 p-4">
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
      )}

      {tab === 'header' && (
      <Card className="space-y-3 p-4">
        <h3>Redes sociais e contatos</h3>
        <p className="text-xs text-muted-foreground">Aparecem como botões redondos, lado a lado. Digite só o número, o @ ou o endereço: o link é montado sozinho.</p>
        {f.links.map((l, i) => {
          const ok = !l.value.trim() || !!hrefOf(l)
          const id = String(i)
          return (
            <div key={i} className="space-y-1">
              <div {...dnd.row(id, dragLink, 'links')} className={`flex items-center gap-2 rounded-lg p-2 ${i % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25'} ${dnd.cls(id)}`}>
                {reorderCol(id, i, f.links.length, moveLink, dragLink, 'links', 'item')}
                <div className="min-w-0 flex-1 space-y-2">
                  <Select aria-label="Tipo" value={l.kind} onChange={(e) => setLink(i, { kind: e.target.value as LinkKind })}>
                    {Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                  <Input aria-label="Número, @ ou endereço" placeholder={LINK_KINDS[l.kind].placeholder} value={l.value} onChange={(e) => setLink(i, { value: e.target.value })} />
                </div>
                <Button type="button" size="icon" variant="ghost" aria-label="Remover" title="Remover" onClick={() => setF({ ...f, links: f.links.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {!ok && <p className="text-xs text-destructive">Esse valor não forma um link válido para {LINK_KINDS[l.kind].label}.</p>}
            </div>
          )
        })}
        <Button type="button" variant="outline" disabled={f.links.length >= 20} onClick={() => setF({ ...f, links: [...f.links, { kind: 'whatsapp', label: '', value: '' }] })}><Plus className="h-4 w-4" /> Adicionar rede ou contato</Button>
      </Card>
      )}

      {tab === 'menu' && (
      <Card className="space-y-3 p-4">
        <div className="space-y-3">
          {menuOrder(f.menu_order).map((key, i) => {
            const b = ({
              enrollment: { id: 'st-enr', label: 'Botão das inscrições', text: f.enrollment_label, on: f.show_enrollment, set: (v: string) => ({ enrollment_label: v }), toggle: () => ({ show_enrollment: !f.show_enrollment }) },
              shop: { id: 'st-shop', label: 'Nome da loja (menu, site e vitrine)', text: f.shop_label, on: f.show_shop, set: (v: string) => ({ shop_label: v }), toggle: () => ({ show_shop: !f.show_shop }) },
              albums: { id: 'st-alb', label: 'Botão das fotos', text: f.albums_label, on: f.show_albums, set: (v: string) => ({ albums_label: v }), toggle: () => ({ show_albums: !f.show_albums }) },
              release: { id: 'st-rel', label: 'Botão do release', text: f.release_label, on: f.show_release, set: (v: string) => ({ release_label: v }), toggle: () => ({ show_release: !f.show_release }) },
              login: { id: 'st-login', label: 'Botão de acesso', text: f.login_label, on: f.show_login, set: (v: string) => ({ login_label: v }), toggle: () => ({ show_login: !f.show_login }) },
            } as const)[key]
            const id = String(i)
            return (
              <div key={key} {...dnd.row(id, dragMenu, 'menu')} className={`flex items-center gap-2 rounded-lg p-2 ${i % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25'} ${dnd.cls(id)}`}>
                {reorderCol(id, i, 5, moveMenu, dragMenu, 'menu', 'botão')}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={b.id}>{b.label}</Label>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-pressed={b.on} aria-label={b.on ? 'Botão visível no site (clique para ocultar)' : 'Botão oculto no site (clique para mostrar)'} title={b.on ? 'Visível no site' : 'Oculto no site'}
                      onClick={() => setF({ ...f, ...b.toggle() })}
                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border ${b.on ? 'bg-card text-foreground' : 'bg-muted text-muted-foreground'} hover:bg-muted`}>
                      {b.on ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                    </button>
                    <Input id={b.id} className="min-w-0 flex-1" value={b.text} onChange={(e) => setF({ ...f, ...b.set(e.target.value) })} />
                  </div>
                  {key === 'release' && (
                    <div className="space-y-1">
                      <Label htmlFor="st-rel-url">Endereço do release (https)</Label>
                      <Input id="st-rel-url" inputMode="url" placeholder="https://drive.google.com/…" value={f.release_url ?? ''} onChange={(e) => setF({ ...f, release_url: e.target.value })} />
                      {f.release_url?.trim() && !/^https:\/\//i.test(f.release_url.trim()) && <p className="text-xs text-destructive">O endereço precisa começar com https://</p>}
                      <p className="text-xs text-muted-foreground">Normalmente um PDF no Drive (compartilhado com “qualquer pessoa com o link”). Sem endereço, o botão não aparece.</p>
                    </div>
                  )}
                  {key === 'shop' && (
                    <div className="space-y-1">
                      <Label htmlFor="st-shop-product">Produto no botão</Label>
                      <Select id="st-shop-product" value={f.shop_product_id ?? ''} onChange={(e) => setF({ ...f, shop_product_id: e.target.value || null })}>
                        <option value="">Nenhum</option>
                        {pickable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                      <p className="text-xs text-muted-foreground">Mostra a miniatura e o título do produto acima do botão da loja; ao clicar, abre a página dele.</p>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={(f.menu_construction ?? []).includes(key)} onChange={(e) => setF({ ...f, menu_construction: e.target.checked ? [...(f.menu_construction ?? []), key] : (f.menu_construction ?? []).filter((k) => k !== key) })} /> Em construção</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.shake_button === key} onChange={(e) => setF({ ...f, shake_button: e.target.checked ? key : null })} /> Destacar</label>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      )}

      {tab === 'albums' && <AlbumsTab />}

      {tab === 'videos' && (
      <Card className="space-y-3 p-4">
        {vids.visible.map((v, i) => {
          const ok = !v.url.trim() || !!youtubeId(v.url)
          const id = String(i)
          return (
            <div key={i} className="space-y-1">
              <div {...dnd.row(id, dragVideo, 'videos')} className={`flex items-center gap-2 rounded-lg p-2 ${i % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25'} ${dnd.cls(id)}`}>
                {reorderCol(id, i, f.videos.length, moveVideo, dragVideo, 'videos', 'vídeo')}
                <div className="min-w-0 flex-1 space-y-2">
                  <Input aria-label="Endereço do vídeo" placeholder="https://www.youtube.com/watch?v=" value={v.url} onChange={(e) => setVideo(i, { url: e.target.value })} />
                  <Input aria-label="Título" placeholder="Título" value={v.title} onChange={(e) => setVideo(i, { title: e.target.value })} />
                </div>
                <Button type="button" size="icon" variant="ghost" aria-label="Remover vídeo" title="Remover vídeo" onClick={() => setF({ ...f, videos: f.videos.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {!ok && <p className="text-xs text-destructive">Cole o endereço de um vídeo do YouTube.</p>}
            </div>
          )
        })}
        {vids.button}
        <Button type="button" variant="outline" disabled={f.videos.length >= 12} onClick={() => { vids.showAll(); setF({ ...f, videos: [...f.videos, { url: '', title: '' }] }) }}><Plus className="h-4 w-4" /> Adicionar vídeo</Button>
      </Card>
      )}

    </div>
  )
}
