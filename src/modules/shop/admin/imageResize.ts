/** Redução de fotos no navegador, antes de enviar: lado maior limitado e formato WebP (carrega rápido no celular). */
export const MAX_SIDE = 900
export const WEBP_QUALITY = 0.8

/** Devolve a foto reduzida em WebP. Nunca amplia: fotos já pequenas só são convertidas. */
export async function resizeImage(source: Blob, maxSide = MAX_SIDE, quality = WEBP_QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível reduzir a foto neste navegador.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    if (!out || out.type !== 'image/webp') throw new Error('Não foi possível reduzir a foto neste navegador.')
    return out
  } finally {
    bitmap.close()
  }
}
