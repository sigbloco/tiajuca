import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileUp, Link2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Label, Select, SheetContent } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import { DrivePicker } from './DrivePicker'
import { getDriveConfig, type DriveFile } from './drive'
import { KIND_LABEL, TUNINGS, hasTuning, guessTarget, listAttachments, openAttachment, uploadSongFile, type Attachment, type AttachmentKind, type Song } from './service'

const field = (v: string) => v.trim() || null

function Attachments({ song, canManage }: { song: Song; canManage: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const instruments = useCatalog('instruments')
  const sections = useCatalog('sections')
  const { membership } = useOrganization()
  const [target, setTarget] = useState('') // 'i:<id>' | 's:<id>' | 't:<afinação>' | ''
  const [kind, setKind] = useState<AttachmentKind>('score')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [filterTarget, setFilterTarget] = useState('mine')
  const [driveOpen, setDriveOpen] = useState(false)
  const drive = useQuery({ queryKey: ['drive-config', orgId], enabled: canManage, retry: false, queryFn: () => getDriveConfig(orgId) })

  const { data } = useQuery({ queryKey: ['attachments', orgId, song.id], queryFn: () => listAttachments(song.id) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['attachments', orgId, song.id] })
  // Meus instrumentos (e afinações): cada pessoa vê primeiro a partitura do próprio instrumento.
  const mine = useQuery({
    queryKey: ['my-instruments', membership?.member_id],
    enabled: Boolean(membership?.member_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('member_artistic_links').select('instrument_id, instruments(section_id, tuning)').eq('member_id', membership!.member_id).is('ended_at', null)
      if (error) throw error
      return (data ?? []) as unknown as { instrument_id: string; instruments: { section_id: string; tuning: string | null } | null }[]
    },
  })
  const myIds = new Set((mine.data ?? []).map((l) => l.instrument_id))
  const mySections = new Set((mine.data ?? []).map((l) => l.instruments?.section_id).filter(Boolean) as string[])
  const myTunings = new Set((mine.data ?? []).map((l) => l.instruments?.tuning).filter((t) => hasTuning(t)) as string[])
  const hasMine = myIds.size > 0
  const targetCols = (t = target) => ({
    instrument_id: t.startsWith('i:') ? t.slice(2) : null,
    section_id: t.startsWith('s:') ? t.slice(2) : null,
    tuning: t.startsWith('t:') ? t.slice(2) : null,
  })
  /** Sem destino escolhido, tenta descobrir pelo nome do arquivo/descrição (ex.: "Trompete.pdf", "Sax alto Eb"). */
  const resolveTarget = (text: string) => {
    if (target) return target
    const g = guessTarget(text, (instruments.data ?? []).filter((i) => i.is_active))
    if (g) toast.info(`Destino sugerido pelo nome: ${g.startsWith('t:') ? 'afinação ' + g.slice(2) : instruments.data?.find((i) => i.id === g.slice(2))?.name}.`)
    return g
  }

  const addUrl = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('song_attachments').insert({
        organization_id: orgId, song_id: song.id, kind, url: url.trim(), description: field(description), source: 'manual', ...targetCols(resolveTarget(`${description} ${url}`)),
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
        description: field(description) ?? f.name, source: 'gdrive', external_ref: f.id, ...targetCols(resolveTarget(`${description} ${f.name}`)),
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
        description: field(description), source: 'storage', ...targetCols(resolveTarget(`${description} ${file.name}`)),
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

  const label = (a: Attachment) => a.instruments?.name ?? (a.sections ? `Naipe ${a.sections.name}` : a.tuning ? `Afinação ${a.tuning}` : 'Todos')
  const forMe = (a: Attachment) => (!a.instrument_id && !a.section_id && !a.tuning) || (a.instrument_id ? myIds.has(a.instrument_id) : false) || (a.tuning ? myTunings.has(a.tuning) : false) || (a.section_id ? mySections.has(a.section_id) : false)
  const shown = (data ?? []).filter((a) => a.is_active && (filterTarget === 'mine' ? (!hasMine || forMe(a)) : !filterTarget || filterTarget === 'all' ||
    (filterTarget.startsWith('i:') ? a.instrument_id === filterTarget.slice(2) || (!a.instrument_id && !a.section_id) : a.section_id === filterTarget.slice(2) || (!a.instrument_id && !a.section_id))))

  return (
    <section className="space-y-2">
      <h3>Partituras e anexos</h3>
      <Select aria-label="Ver partitura de" value={filterTarget} onChange={(e) => setFilterTarget(e.target.value)}>
        {hasMine && <option value="mine">Para o meu instrumento</option>}
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
              <optgroup label="Afinação (todos os instrumentos dela)">{TUNINGS.map((t) => <option key={t} value={`t:${t}`}>Afinação {t}</option>)}</optgroup>
              <optgroup label="Naipe">{sections.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Instrumento">{instruments.data?.filter((i) => i.is_active).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name}</option>)}</optgroup>
            </Select>
          </div>
          <Input placeholder="Descrição (ex.: Partitura Trompete Bb)" value={description} onChange={(e) => setDescription(e.target.value)} />
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

/** Pasta da música no Drive: navegar pelas pastas do Drive do bloco, escolher uma das pastas cadastradas ou colar o link. */
function DriveFolderField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const orgId = useOrgId()
  const [browse, setBrowse] = useState(false)
  const [picked, setPicked] = useState('')
  const cfg = useQuery({ queryKey: ['drive-config', orgId], retry: false, queryFn: () => getDriveConfig(orgId) })
  const registered = useQuery({
    queryKey: ['drive-folders', orgId, 'for-songs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drive_folders').select('id, name, url').eq('organization_id', orgId).eq('is_active', true).order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string; url: string }[]
    },
  })
  return (
    <div className="space-y-1.5">
      <Label htmlFor="s-drive">Pasta da música no Drive (opcional)</Label>
      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm">{picked || value}</span>
          <Button asChild size="sm" variant="outline"><a href={value} target="_blank" rel="noreferrer noopener">Abrir</a></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(''); setPicked('') }}>Tirar</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {cfg.data?.active && <Button type="button" size="sm" variant="outline" onClick={() => setBrowse(!browse)}>{browse ? 'Fechar navegação' : 'Navegar pelas pastas do Drive'}</Button>}
        {(registered.data ?? []).length > 0 && (
          <Select aria-label="Pastas cadastradas" className="w-56" value="" onChange={(e) => { const r = registered.data?.find((x) => x.id === e.target.value); if (r) { onChange(r.url); setPicked(r.name) } }}>
            <option value="">Pastas cadastradas…</option>
            {registered.data!.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
      </div>
      {browse && <DrivePicker onPickFolder={(fo) => { onChange(fo.url); setPicked(fo.name); setBrowse(false) }} />}
      <Input id="s-drive" type="url" placeholder="ou cole o link: https://drive.google.com/drive/folders/…" value={value} onChange={(e) => { onChange(e.target.value); setPicked('') }} />
    </div>
  )
}

/** Música (criar/editar) + anexos por instrumento/naipe, tudo em um drawer. */
export function SongSheet({ repertoireId, song, onClose }: { repertoireId: string; song: Song | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('repertoire.manage')
  const [f, setF] = useState({ title: song?.title ?? '', artist: song?.artist ?? '', genre: song?.genre ?? '', musical_key: song?.musical_key ?? '', notes: song?.notes ?? '', guide_url: song?.guide_url ?? '', drive_folder_url: song?.drive_folder_url ?? '' })
  const urlOk = (v: string) => !v.trim() || /^https?:///i.test(v.trim())
  const valid = !!f.title.trim() && !!f.artist.trim() && urlOk(f.guide_url) && urlOk(f.drive_folder_url)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const save = useMutation({
    mutationFn: async () => {
      const row = { title: f.title.trim(), artist: field(f.artist), genre: field(f.genre), musical_key: field(f.musical_key), notes: field(f.notes), guide_url: field(f.guide_url), drive_folder_url: field(f.drive_folder_url) }
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
        <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate() }} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="s-title">Título</Label><Input id="s-title" required value={f.title} onChange={set('title')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-artist">Artista</Label><Input id="s-artist" required value={f.artist} onChange={set('artist')} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-guide">Link do guia (opcional)</Label><Input id="s-guide" type="url" placeholder="https://…" value={f.guide_url} onChange={set('guide_url')} /></div>
          <DriveFolderField value={f.drive_folder_url} onChange={(v) => setF({ ...f, drive_folder_url: v })} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="s-genre">Gênero</Label><Input id="s-genre" value={f.genre} onChange={set('genre')} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-key">Tom</Label><Input id="s-key" placeholder="Ex.: Dó maior" value={f.musical_key} onChange={set('musical_key')} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="s-notes">Observações</Label>
            <textarea id="s-notes" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.notes} onChange={set('notes')} /></div>
          <Button type="submit" className="w-full" disabled={!valid || save.isPending}>Salvar música</Button>
        </form>
      ) : (
        <dl className="space-y-1">
          {(song?.guide_url || song?.drive_folder_url) && (
            <div className="flex flex-wrap gap-2">
              {song.guide_url && <Button asChild variant="outline"><a href={song.guide_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Guia</a></Button>}
              {song.drive_folder_url && <Button asChild variant="outline"><a href={song.drive_folder_url} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Pasta no Drive</a></Button>}
            </div>
          )}
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
