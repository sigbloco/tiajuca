import { supabase } from '@/core/supabase'
import type { TypeColor } from '@/modules/events/service'

export interface Repertoire {
  id: string
  name: string
  description: string | null
  color: TypeColor
  sort_order: number
  is_active: boolean
  songs: { count: number }[]
}
export interface Song {
  id: string
  repertoire_id: string
  title: string
  artist: string | null
  genre: string | null
  musical_key: string | null
  notes: string | null
  sort_order: number
  is_active: boolean
}
export type AttachmentKind = 'score' | 'audio' | 'video' | 'lyrics' | 'other'
export const KIND_LABEL: Record<AttachmentKind, string> = { score: 'Partitura', audio: 'Áudio', video: 'Vídeo', lyrics: 'Letra', other: 'Outro' }

export interface Attachment {
  id: string
  song_id: string
  instrument_id: string | null
  section_id: string | null
  kind: AttachmentKind
  url: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  description: string | null
  source: 'manual' | 'storage' | 'gdrive'
  is_active: boolean
  instruments: { name: string } | null
  sections: { name: string } | null
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'video/mp4']

export async function listRepertoires(orgId: string) {
  const { data, error } = await supabase.from('repertoires').select('*, songs(count)').eq('organization_id', orgId).eq('songs.is_active', true)
    .order('sort_order').order('name')
  if (error) throw error
  return (data ?? []) as unknown as Repertoire[]
}

export async function listSongs(repertoireId: string) {
  const { data, error } = await supabase.from('songs').select('*').eq('repertoire_id', repertoireId).order('sort_order').order('title')
  if (error) throw error
  return (data ?? []) as Song[]
}

export async function listAttachments(songId: string) {
  const { data, error } = await supabase.from('song_attachments')
    .select('id, song_id, instrument_id, section_id, kind, url, storage_path, file_name, mime_type, size_bytes, description, source, is_active, instruments(name), sections(name)')
    .eq('song_id', songId).order('created_at')
  if (error) throw error
  return (data ?? []) as unknown as Attachment[]
}

/** Abre o anexo: URL externa direto, ou URL assinada (curta) para arquivo privado do Storage. */
export async function openAttachment(a: Attachment) {
  if (a.storage_path) {
    const { data, error } = await supabase.storage.from('org-files').createSignedUrl(a.storage_path, 3600)
    if (error) throw error
    window.open(data.signedUrl, '_blank', 'noopener')
  } else if (a.url) {
    window.open(a.url, '_blank', 'noopener')
  }
}

const safeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)

/** Envia o arquivo para `{organização}/musicas/{música}/…` no bucket privado. */
export async function uploadSongFile(orgId: string, songId: string, file: File): Promise<{ path: string }> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Arquivo maior que 25 MB.')
  if (!ALLOWED_MIME.includes(file.type)) throw new Error('Tipo de arquivo não permitido. Use PDF, imagem, áudio ou vídeo MP4.')
  const path = `${orgId}/musicas/${songId}/${crypto.randomUUID()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from('org-files').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return { path }
}

/** Texto do repertório para WhatsApp/mensagens. */
export function shareText(rep: Pick<Repertoire, 'name' | 'description'>, songs: Song[]): string {
  const lines = songs.filter((s) => s.is_active).map((s, i) => {
    const extra = [s.artist, s.musical_key ? `tom ${s.musical_key}` : null].filter(Boolean).join(' · ')
    return `${i + 1}. ${s.title}${extra ? ` — ${extra}` : ''}`
  })
  return [`*${rep.name}*`, rep.description ? rep.description : null, '', ...(lines.length ? lines : ['(sem músicas ainda)'])].filter((l) => l !== null).join('\n')
}
