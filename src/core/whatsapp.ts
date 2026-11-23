/** Link do WhatsApp (celulares brasileiros: DDD + número; sem o 55, ele é acrescentado). Menos de 10 dígitos: sem link. */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  const d = (phone ?? '').replace(/D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') ? d : '55' + d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
