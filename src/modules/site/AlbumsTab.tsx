import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ExternalLink, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useProgressive } from '@/components/shared/LoadMore'
import { TrashDrawer } from '@/components/shared/TrashDrawer'
import { DateInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useHoldReorder } from '@/core/holdReorder'
import { useOrgId } from '@/core/organization'
import { requireFields } from '@/core/required'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { listAlbums, parseAlbumTitle, previewAlbum, type Album, type Author } from './albums'
import { LINK_KINDS, type LinkKind } from './links'

/** Lista de autores a partir dos @ achados no nome do álbum (assumidos do Instagram). */
const fromHandles = (handles: string[]): Author[] => handles.map((h) => ({ kind: 'instagram', value: `@${h}` }))

const isPhotosUrl = (u: string) => /^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(u)

/** Álbuns de fotos: cole o link público do Google Fotos; o sistema lê o título e a capa e monta o cartão. */
export function AlbumsTab() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['site-albums', orgId], queryFn: () => listAlbums(orgId) })
  const [url, setUrl] = useState('')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['site-albums', orgId] }); qc.invalidateQueries({ queryKey: ['public-albums'] }) }
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : friendlyError(e))
  const all = data ?? []
  const active = all.filter((a) => a.is_active)
  const trashed = all.filter((a) => !a.is_active)
  const prog = useProgressive(active, 5)
  const dnd = useHoldReorder()
  // Relê, de 3 em 3, título e capa dos álbuns que ainda não têm capa.
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const missing = active.filter((a) => !a.cover_url)
  // mode 'missing': lê capa e título dos que ainda não têm capa. mode 'titles': relê só título, data e autores de todos (depois de renomear álbuns no Google Fotos).
  const readBulk = async (mode: 'missing' | 'titles') => {
    const list = mode === 'missing' ? missing : active
    const queue = [...list]
    setBulk({ done: 0, total: list.length })
    let done = 0, failed = 0
    const worker = async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        try {
          const info = await previewAlbum(orgId, a.url, { cover: mode === 'missing' })
          const p = parseAlbumTitle(info.title)
          const fields: Partial<Album> = { cover_url: info.cover_url ?? a.cover_url }
          if (info.title) Object.assign(fields, { title: p.title, event_date: p.event_date, authors: p.handles.length ? fromHandles(p.handles) : a.authors })
          const { error } = await supabase.from('site_albums').update(fields).eq('id', a.id).eq('organization_id', orgId)
          if (error) throw error
        } catch { failed++ }
        setBulk({ done: ++done, total: list.length })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setBulk(null)
    refresh()
    notifySaved(failed ? `Capas lidas. ${failed} álbum(ns) não deram certo: abra o link e confira se está compartilhado.` : 'Capas e títulos atualizados.')
  }

  const add = useMutation({
    mutationFn: async () => {
      const link = url.trim()
      if (all.some((a) => a.url === link)) throw new Error('Esse álbum já está na lista.')
      const info = await previewAlbum(orgId, link).catch(() => ({ title: '', cover_url: null as string | null }))
      const p = parseAlbumTitle(info.title)
      const top = active.reduce((m, a) => Math.min(m, a.sort_order), 0) - 1
      const { error } = await supabase.from('site_albums').insert({
        organization_id: orgId, url: link, title: p.title, event_date: p.event_date, authors: fromHandles(p.handles), cover_url: info.cover_url, sort_order: top,
      })
      if (error) throw error
      return info
    },
    onSuccess: (info) => { setUrl(''); prog.showAll(); refresh(); notifySaved(info.title ? 'Álbum adicionado.' : 'Álbum adicionado, mas o Google não mostrou título nem capa: preencha à mão.') },
    onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { id: string; fields: Partial<Album> }) => {
      const { error } = await supabase.from('site_albums').update(v.fields).eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { refresh(); notifySaved('Álbum atualizado.') },
    onError,
  })
  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('site_albums').delete().eq('id', id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { refresh(); notifySaved('Álbum excluído.') },
    onError,
  })
  // Reordena renumerando a lista ativa inteira.
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await Promise.all(ids.map((id, i) => supabase.from('site_albums').update({ sort_order: i }).eq('id', id).eq('organization_id', orgId)))
      const bad = res.find((r) => r.error)
      if (bad?.error) throw bad.error
    },
    onSuccess: refresh,
    onError,
  })
  const move = (i: number, d: number) => {
    const ids = active.map((a) => a.id)
    const [it] = ids.splice(i, 1)
    ids.splice(i + d, 0, it)
    reorder.mutate(ids)
  }
  const drag = (from: string, to: string) => {
    const a = active.findIndex((x) => x.id === from), b = active.findIndex((x) => x.id === to)
    if (a >= 0 && b >= 0) move(a, b - a)
  }

  if (isLoading) return <Skeleton className="h-40" />
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3>Álbuns de fotos</h3>
        <TrashDrawer iconOnly entries={trashed.map((a) => ({ id: a.id, name: a.title || a.url }))}
          onRestore={(id) => patch.mutate({ id, fields: { is_active: true } })} onPurge={(id) => purge.mutate(id)} />
      </div>
      <p className="text-xs text-muted-foreground">Cole o link público de compartilhamento do álbum (photos.app.goo.gl ou photos.google.com/share…). O sistema lê o título e a capa. Nomes no padrão “250608 Aniversário do Museu Nacional (@brunosarlas)” viram data, título e autor.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-w-56 flex-1" aria-label="Link do álbum" placeholder="https://photos.app.goo.gl/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="button" disabled={add.isPending}
          onClick={() => { if (requireFields([['Link do álbum', url.trim()], ['Link do Google Fotos (photos.app.goo.gl ou photos.google.com)', !url.trim() || isPhotosUrl(url.trim())]])) add.mutate() }}>
          <Plus className="h-4 w-4" /> {add.isPending ? 'Lendo o álbum' : 'Adicionar'}
        </Button>
      </div>
      {missing.length > 0 && (
        <Button type="button" variant="outline" className="w-full" disabled={!!bulk} onClick={() => void readBulk('missing')}>
          <RefreshCw className={`h-4 w-4 ${bulk ? 'animate-spin' : ''}`} /> {bulk ? `Lendo ${bulk.done}/${bulk.total}` : `Ler capas e títulos que faltam (${missing.length})`}
        </Button>
      )}
      {active.length > 0 && (
        <Button type="button" variant="outline" className="w-full" disabled={!!bulk} onClick={() => void readBulk('titles')}>
          <RefreshCw className={`h-4 w-4 ${bulk ? 'animate-spin' : ''}`} /> {bulk ? `Lendo ${bulk.done}/${bulk.total}` : `Atualizar títulos, datas e autores de todos (${active.length})`}
        </Button>
      )}
      {active.length === 0 && <p className="text-muted-foreground">Nenhum álbum ainda.</p>}
      {prog.visible.map((a, i) => (
        <AlbumRow key={a.id} album={a} index={i} total={active.length} dnd={dnd} onMove={move} onDrag={drag}
          onSave={(fields) => patch.mutateAsync({ id: a.id, fields })}
          onTrash={() => patch.mutate({ id: a.id, fields: { is_active: false } })}
          onRefresh={async () => {
            const info = await previewAlbum(orgId, a.url)
            const p = parseAlbumTitle(info.title)
            await patch.mutateAsync({ id: a.id, fields: { cover_url: info.cover_url ?? a.cover_url, ...(info.title ? { title: p.title, event_date: p.event_date, authors: p.handles.length ? fromHandles(p.handles) : a.authors } : {}) } })
          }} />
      ))}
      {prog.button}
    </Card>
  )
}

function AlbumRow({ album: a, index, total, dnd, onMove, onDrag, onSave, onTrash, onRefresh }: {
  album: Album; index: number; total: number; dnd: ReturnType<typeof useHoldReorder>
  onMove: (i: number, d: number) => void; onDrag: (from: string, to: string) => void
  onSave: (fields: Partial<Album>) => Promise<unknown>; onTrash: () => void; onRefresh: () => Promise<unknown>
}) {
  const [d, setD] = useState({ title: a.title, event_date: a.event_date, authors: a.authors })
  const [busy, setBusy] = useState(false)
  const dirty = d.title !== a.title || d.event_date !== a.event_date || JSON.stringify(d.authors) !== JSON.stringify(a.authors)
  // Chegou título/capa/autores novos do Google (reler): o rascunho acompanha.
  useEffect(() => { setD({ title: a.title, event_date: a.event_date, authors: a.authors }) }, [a.title, a.event_date, a.authors])
  const setAuthor = (i: number, p: Partial<Author>) => setD((x) => ({ ...x, authors: x.authors.map((u, k) => (k === i ? { ...u, ...p } : u)) }))
  return (
    <div {...dnd.row(a.id, onDrag, 'albums')} className={`flex items-start gap-2 rounded-lg border border-border p-2 ${dnd.cls(a.id)}`}>
      <div className="flex flex-col items-center">
        <Button type="button" size="icon" variant="ghost" className="h-6 w-7" aria-label="Subir álbum" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
        {dnd.handle(a.id, onDrag, 'albums')}
        <Button type="button" size="icon" variant="ghost" className="h-6 w-7" aria-label="Descer álbum" disabled={index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {a.cover_url ? <img src={a.cover_url} alt="" className="aspect-[4/3] w-full max-w-xs rounded-lg object-cover" /> : <div aria-hidden className="flex aspect-[4/3] w-full max-w-xs items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">sem capa</div>}
        <Input aria-label="Título" placeholder="Título" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <DateInput aria-label="Data do evento" value={d.event_date ?? ''} onChange={(v) => setD({ ...d, event_date: v || null })} />
        <div className="space-y-1.5">
          <Label>Autores (“por …”)</Label>
          {d.authors.map((u, i) => (
            <div key={i} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
              <Select aria-label="Rede do autor" value={u.kind} onChange={(e) => setAuthor(i, { kind: e.target.value as LinkKind })}>
                {Object.entries(LINK_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Input aria-label="Usuário ou endereço do autor" placeholder={LINK_KINDS[u.kind].placeholder} value={u.value} onChange={(e) => setAuthor(i, { value: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label="Remover autor" title="Remover autor" onClick={() => setD({ ...d, authors: d.authors.filter((_, k) => k !== i) })}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" disabled={d.authors.length >= 10} onClick={() => setD({ ...d, authors: [...d.authors, { kind: 'instagram', value: '' }] })}><Plus className="h-4 w-4" /> Autor</Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {dirty && <Button type="button" size="sm" onClick={() => { if (requireFields([['Título', d.title.trim()]])) void onSave({ title: d.title.trim(), event_date: d.event_date, authors: d.authors.filter((u) => u.value.trim()).map((u) => ({ kind: u.kind, value: u.value.trim() })) }) }}><Save className="h-4 w-4" /> Salvar</Button>}
          <Button asChild size="icon" variant="ghost" className="h-9 w-9"><a href={a.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir o álbum" title="Abrir o álbum"><ExternalLink className="h-4 w-4" /></a></Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" disabled={busy} aria-label="Reler título e capa do Google" title="Reler título e capa do Google"
            onClick={async () => { setBusy(true); try { await onRefresh() } catch (e) { toast.error(e instanceof Error ? e.message : friendlyError(e)) } finally { setBusy(false) } }}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label="Mover para a lixeira" title="Mover para a lixeira" onClick={onTrash}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
