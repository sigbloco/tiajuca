import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileUp, Link2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { DrivePicker } from './DrivePicker'
import { getDriveConfig, type DriveFile } from './drive'
import { KIND_LABEL, listAttachments, openAttachment, uploadSongFile, type Attachment, type AttachmentKind, type Song } from './service'

const field = (v: string) => v.trim() || null

function Attachments({ song, canManage }: { song: Song; canManage: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const instruments = useCatalog('instruments')
  const sections = useCatalog('sections')
  const [target, setTarget] = useState('') // 'i:<id>' | 's:<id>' | ''
  const [kind, setKind] = useState<AttachmentKind>('score')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [filterTarget, setFilterTarget] = useState('')
  const [driveOpen, setDriveOpen] = useState(false)
  const drive = useQuery({ queryKey: ['drive-config', orgId], enabled: canManage, retry: false, queryFn: () => getDriveConfig(orgId) })

  const { data } = useQuery({ queryKey: ['attachments', orgId, song.id], queryFn: () => listAttachments(song.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['attachments', orgId, song.id] })
  const targetCols = () => ({
    instrument_id: target.startsWith('i:') ? target.slice(2) : null,
    section_id: target.startsWith('s:') ? target.slice(2) : null,
  })

  const addUrl = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('song_attachments').insert({
        organization_id: orgId, song_id: song.id, kind, url: url.trim(), description: field(description), source: 'manual', ...targetCols(),
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Link adicionado.'); setUrl(''); setDescription(''); refresh() },
    onError: (e) => toast.error(/check|violat/i.test(String(e)) ? 'Informe um endereço que comece com http:// ou https://.' : friendlyError(e)),
  })
  const addDrive = useMutation({
    mutationFn: async (f: DriveFile) => {
      const { error } = await supabase.from('song_attachments').insert({
        organization_id: orgId, song_id: song.id, kind, url: f.web_view_link, file_name: f.name, mime_type: f.mime_type,
        description: field(description) ?? f.name, source: 'gdrive', external_ref: f.id, ...targetCols(),
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Arquivo do Drive anexado.'); setDriveOpen(false); setDescription(''); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { path } = await uploadSongFile(orgId, song.id, file)
      const { error } = await supabase.from('song_attachments').insert({
        organization_id: orgId, song_id: song.id, kind, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
        description: field(description), source: 'storage', ...targetCols(),
      })
      if (error) { await supabase.storage.from('org-files').remove([path]); throw error }
    },
    onSuccess: () => { toast.success('Arquivo enviado.'); setDescription(''); refresh() },
    onError: (e) => toast.error((e as Error).message?.match(/25 MB|Tipo de arquivo/) ? (e as Error).message : friendlyError(e, 'Não foi possível enviar o arquivo.')),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('song_attachments').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Anexo removido.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const open = useMutation({ mutationFn: (a: Attachment) => openAttachment(a), onError: () => toast.error('Não foi possível abrir o arquivo.') })

  const label = (a: Attachment) => a.instruments?.name ?? (a.sections ? `Naipe ${a.sections.name}` : 'Todos')
  const shown = (data ?? []).filter((a) => a.is_active && (!filterTarget || filterTarget === 'all' ||
    (filterTarget.startsWith('i:') ? a.instrument_id === filterTarget.slice(2) || (!a.instrument_id && !a.section_id) : a.section_id === filterTarget.slice(2) || (!a.instrument_id && !a.section_id))))

  return (
    <section className="space-y-2">
      <h3>Partituras e anexos</h3>
      <Select aria-label="Ver partitura de" value={filterTarget} onChange={(e) => setFilterTarget(e.target.value)}>
        <option value="">Todos os anexos</option>
        <optgroup label="Instrumento">{instruments.data?.filter((i) => i.is_active).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}</optgroup>
      </Select>
      {shown.length === 0 && <p className="text-muted-foreground">Nenhum anexo.</p>}
      {shown.map((a) => (
        <Card key={a.id} className="flex items-center justify-between gap-2 p-2.5">
          <button className="min-w-0 flex-1 text-left" onClick={() => open.mutate(a)}>
            <p className="flex items-center gap-1.5 truncate font-semibold"><ExternalLink className="h-4 w-4 shrink-0" />{a.description || a.file_name || a.url}</p>
            <p className="text-muted-foreground"><Badge>{KIND_LABEL[a.kind]}</Badge> {label(a)}{a.source === 'storage' ? ' · arquivo' : ' · link'}</p>
          </button>
          {canManage && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm('Remover este anexo?')) remove.mutate(a.id) }}>Remover</Button>}
        </Card>
      ))}

      {canManage && (
        <Card className="space-y-2 p-3">
          <p className="font-semibold">Adicionar anexo</p>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select aria-label="Para" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Para todos</option>
              <optgroup label="Naipe">{sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Instrumento">{instruments.data?.filter((i) => i.is_active).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}</optgroup>
            </Select>
          </div>
          <Input placeholder="Descrição (ex.: Partitura Tamborim)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <Input placeholder="Colar link (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button size="sm" disabled={!/^https?:\/\//i.test(url.trim()) || addUrl.isPending} onClick={() => addUrl.mutate()}><Link2 className="h-4 w-4" /> Adicionar</Button>
          </div>
          <input ref={fileRef} type="file" hidden accept="application/pdf,image/*,audio/*,video/mp4"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f) }} />
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> {upload.isPending ? 'Enviando…' : 'Enviar arquivo (PDF, imagem, áudio; até 25 MB)'}
          </Button>
          {drive.data?.active && (
            <Button size="sm" variant="outline" onClick={() => setDriveOpen(!driveOpen)}>{driveOpen ? 'Fechar busca no Drive' : 'Buscar no Google Drive'}</Button>
          )}
          {driveOpen && <DrivePicker onPick={(f) => (f.web_view_link ? addDrive.mutate(f) : toast.error('Este arquivo não tem link de visualização.'))} />}
          <p className="text-xs text-muted-foreground">Arquivos enviados ficam em armazenamento privado da organização. Links e arquivos do Drive também podem ser anexados.</p>
        </Card>
      )}
    </section>
  )
}

/** Música (criar/editar) + anexos por instrumento/naipe, tudo em um drawer. */
export function SongSheet({ repertoireId, song, onClose }: { repertoireId: string; song: Song | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('repertoire.manage')
  const [f, setF] = useState({ title: song?.title ?? '', artist: song?.artist ?? '', genre: song?.genre ?? '', musical_key: song?.musical_key ?? '', notes: song?.notes ?? '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const save = useMutation({
    mutationFn: async () => {
      const row = { title: f.title.trim(), artist: field(f.artist), genre: field(f.genre), musical_key: field(f.musical_key), notes: field(f.notes) }
      const q = song ? supabase.from('songs').update(row).eq('id', song.id)
        : supabase.from('songs').insert({ ...row, organization_id: orgId, repertoire_id: repertoireId, sort_order: 9999 })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { toast.success(song ? 'Música atualizada.' : 'Música criada. Edite-a para anexar partituras.'); qc.invalidateQueries({ queryKey: ['songs', orgId, repertoireId] }); qc.invalidateQueries({ queryKey: ['repertoires', orgId] }); if (!song) onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('songs').update({ is_active: !song!.is_active }).eq('id', song!.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['songs', orgId, repertoireId] }); qc.invalidateQueries({ queryKey: ['repertoires', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <SheetContent title={song?.title ?? 'Nova música'} description={song?.artist ?? 'Preencha os dados e salve; depois anexe as partituras.'}>
      {canManage ? (
        <form onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) save.mutate() }} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="s-title">Título</Label><Input id="s-title" required value={f.title} onChange={set('title')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-artist">Artista / compositor</Label><Input id="s-artist" value={f.artist} onChange={set('artist')} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="s-genre">Gênero</Label><Input id="s-genre" value={f.genre} onChange={set('genre')} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-key">Tom</Label><Input id="s-key" placeholder="Ex.: Dó maior" value={f.musical_key} onChange={set('musical_key')} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="s-notes">Observações</Label>
            <textarea id="s-notes" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.notes} onChange={set('notes')} /></div>
          <Button type="submit" className="w-full" disabled={!f.title.trim() || save.isPending}>Salvar música</Button>
        </form>
      ) : (
        <dl className="space-y-1">
          {song?.genre && <div><dt className="text-muted-foreground">Gênero</dt><dd>{song.genre}</dd></div>}
          {song?.musical_key && <div><dt className="text-muted-foreground">Tom</dt><dd>{song.musical_key}</dd></div>}
          {song?.notes && <div><dt className="text-muted-foreground">Observações</dt><dd className="whitespace-pre-wrap">{song.notes}</dd></div>}
        </dl>
      )}
      {song && <Attachments song={song} canManage={canManage} />}
      {song && canManage && (
        <Button variant="ghost" className={song.is_active ? 'text-destructive' : ''} onClick={() => { if (!song.is_active || window.confirm('Desativar esta música? Ela some da lista, mas os anexos são mantidos.')) toggle.mutate() }}>
          {song.is_active ? 'Desativar música' : 'Reativar música'}
        </Button>
      )}
    </SheetContent>
  )
}
