import { Globe, Mail, Music, Phone } from 'lucide-react'
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>
const base = (p: IconProps) => ({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p })

// A versão de ícones do projeto não traz marcas; estes são desenhos simples e neutros.
const WhatsappIcon = (p: IconProps) => (<svg {...base(p)}><path d="M3 21l1.7-5A9 9 0 1 1 8 19.3z" /><path d="M9.2 7.8c.3-.4.9-.3 1.1.1l.7 1.5c.1.3 0 .6-.2.8l-.6.6c.6 1.2 1.600 2.200 2.800 2.800l.6-.6c.2-.2.5-.3.8-.2l1.500.7c.4.2.5.8.1 1.100-.7.700-1.600 1.100-2.500.900-2.800-.7-4.900-2.800-5.600-5.600-.2-.9.200-1.800.9-2.400z" fill="currentColor" stroke="none" /></svg>)
const InstagramIcon = (p: IconProps) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" /></svg>)
const YoutubeIcon = (p: IconProps) => (<svg {...base(p)}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" /></svg>)
const FacebookIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="9.5" /><path d="M13.5 20v-7h2.3l.4-2.6h-2.7V8.9c0-.8.3-1.3 1.4-1.3h1.4V5.3c-.3 0-1.1-.1-2-.1-2.1 0-3.5 1.3-3.5 3.6v1.6H8.5V13h2.3v7" /></svg>)
const SpotifyIcon = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="9.5" /><path d="M7 9.5c3.3-1 6.7-.7 10 .8M7.6 12.6c2.8-.8 5.6-.5 8.2.8M8.2 15.6c2.3-.6 4.5-.4 6.6.7" /></svg>)

export type LinkKind = 'whatsapp' | 'email' | 'instagram' | 'youtube' | 'facebook' | 'tiktok' | 'spotify' | 'telefone' | 'site'
export interface SiteLink { kind: LinkKind; label: string; value: string }
export interface SiteVideo { url: string; title: string }

export const LINK_KINDS: Record<LinkKind, { label: string; placeholder: string; icon: (c?: string) => ReactNode }> = {
  whatsapp: { label: 'WhatsApp', placeholder: '(21) 99999-9999', icon: (c) => <WhatsappIcon className={c} /> },
  email: { label: 'E-mail', placeholder: 'contato@exemplo.com', icon: (c) => <Mail className={c} aria-hidden /> },
  instagram: { label: 'Instagram', placeholder: '@cordaodatiajuca', icon: (c) => <InstagramIcon className={c} /> },
  youtube: { label: 'YouTube', placeholder: 'https://youtube.com/@canal', icon: (c) => <YoutubeIcon className={c} /> },
  facebook: { label: 'Facebook', placeholder: 'https://facebook.com/pagina', icon: (c) => <FacebookIcon className={c} /> },
  tiktok: { label: 'TikTok', placeholder: '@usuario', icon: (c) => <Music className={c} aria-hidden /> },
  spotify: { label: 'Spotify', placeholder: 'https://open.spotify.com/…', icon: (c) => <SpotifyIcon className={c} /> },
  telefone: { label: 'Telefone', placeholder: '(21) 3333-3333', icon: (c) => <Phone className={c} aria-hidden /> },
  site: { label: 'Site', placeholder: 'https://…', icon: (c) => <Globe className={c} aria-hidden /> },
}

const digits = (s: string) => s.replace(/\D/g, '')
const handle = (s: string) => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/\/$/, '')
const https = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`)

/** Link final a partir do que a Direção digitou (número, @usuário ou endereço). Só devolve http(s), mailto ou tel. */
export function hrefOf(l: SiteLink): string | null {
  const v = (l.value ?? '').trim()
  if (!v) return null
  switch (l.kind) {
    case 'whatsapp': { const d = digits(v); return d.length >= 10 ? `https://wa.me/${d.startsWith('55') ? d : `55${d}`}` : null }
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? `mailto:${v}` : null
    case 'telefone': { const d = digits(v); return d.length >= 8 ? `tel:+${d.startsWith('55') ? d : `55${d}`}` : null }
    case 'instagram': return /instagram\.com/i.test(v) ? https(v) : `https://instagram.com/${handle(v)}`
    case 'tiktok': return /tiktok\.com/i.test(v) ? https(v) : `https://www.tiktok.com/@${handle(v)}`
    default: return /^javascript:/i.test(v) ? null : https(v)
  }
}

/** ID do vídeo do YouTube (watch, youtu.be, shorts ou embed). */
export function youtubeId(url: string): string | null {
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/i.exec(url.trim())
  return m ? m[1] : null
}

/** Cor do texto (branco ou quase preto) que contrasta com o fundo hex informado. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1c1c14' : '#ffffff'
}
