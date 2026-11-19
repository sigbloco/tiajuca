import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

/** Iniciais como no Google: primeira letra do primeiro nome e da última palavra do sobrenome ("Rafael Braz" → RB; só um nome → R). */
const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
export function initialsOf(name: string | null | undefined): string {
  // Só o nome completo, em palavras com letras: o apelido entre parênteses e símbolos não entram ("Rafael Braz (Rafa)" → RB).
  const words = (name ?? '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  if (words.length === 0) return '?'
  const first = words[0]
  const last = [...words.slice(1)].reverse().find((w) => !CONNECTORS.has(w.toLowerCase()))
  return ((first[0] ?? '') + (last?.[0] ?? '')).toLocaleUpperCase('pt-BR')
}

/** Tons neutros (fundo e letra) para quem não tem foto; o mesmo nome sempre cai no mesmo tom. */
const TONES = [
  { bg: '#d6d3d1', fg: '#44403c' }, { bg: '#cbd5e1', fg: '#334155' }, { bg: '#d4d4d8', fg: '#3f3f46' },
  { bg: '#e5e7eb', fg: '#374151' }, { bg: '#d1d5db', fg: '#374151' }, { bg: '#e7e5e4', fg: '#44403c' },
] as const
export function neutralTone(name: string | null | undefined): { bg: string; fg: string } {
  let h = 0
  for (const ch of (name ?? '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

const BUCKET = 'member-photos'
const SIZE = 512

/** Recorta o centro em quadrado e reduz (512 px, WebP): a foto fica leve e já em círculo no app. */
export async function cropToSquare(file: File): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.')
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem.')
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85))
  if (!blob) throw new Error('Não foi possível preparar a imagem.')
  return blob
}

/** Envia a foto (já cortada), grava o caminho e apaga a anterior. */
export async function saveMemberPhoto(orgId: string, memberId: string, file: File): Promise<void> {
  const blob = await cropToSquare(file)
  const path = `${orgId}/${memberId}/${Date.now()}.webp`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false })
  if (up.error) throw up.error
  const { data: old, error } = await supabase.rpc('set_member_photo', { p_member: memberId, p_path: path })
  if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error }
  if (old) await supabase.storage.from(BUCKET).remove([old as string])
}

export async function removeMemberPhoto(memberId: string): Promise<void> {
  const { data: old, error } = await supabase.rpc('set_member_photo', { p_member: memberId, p_path: null })
  if (error) throw error
  if (old) await supabase.storage.from(BUCKET).remove([old as string])
}

/** Fotos (endereços temporários) e iniciais do nome completo de todos do bloco, por id do integrante. Buscados uma vez e guardados por ~45 min. */
export function useMemberPhotos() {
  const { membership } = useOrganization()
  const orgId = membership?.organization_id
  return useQuery({
    queryKey: ['member-photos', orgId],
    enabled: !!orgId,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_photos', { p_org: orgId! })
      if (error) throw error
      const rows = (data ?? []) as { member_id: string; photo_path: string | null; initials: string }[]
      const urls = new Map<string, string>()
      const initials = new Map(rows.map((r) => [r.member_id, r.initials] as const))
      const withPhoto = rows.filter((r) => r.photo_path)
      if (withPhoto.length > 0) {
        const signed = await supabase.storage.from(BUCKET).createSignedUrls(withPhoto.map((r) => r.photo_path!), 3600)
        if (signed.error) throw signed.error
        const byPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]))
        for (const r of withPhoto) { const u = byPath.get(r.photo_path!); if (u) urls.set(r.member_id, u) }
      }
      return { urls, initials }
    },
  })
}
