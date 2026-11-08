import { useState, type ReactNode } from 'react'
import { Collapsible } from '@/components/shared/Collapsible'

/**
 * Bloco da ficha do integrante. Por padrão é só um título com o conteúdo embaixo (sem caixas nem contornos);
 * com `collapsible` vira uma faixa que abre e fecha (só os dados sensíveis).
 * `level` 1 = título de seção, 2 = subtítulo (menor, dentro de uma seção).
 */
export function MemberSection({ title, collapsible = false, level = 1, children }: { title: ReactNode; collapsible?: boolean; level?: 1 | 2; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (collapsible) {
    return <Collapsible open={open} onToggle={() => setOpen((o) => !o)} title={title} titleClass="overflow-visible whitespace-normal text-[15px] leading-tight">{children}</Collapsible>
  }
  return (
    <section className="space-y-1.5">
      {level === 1 ? <h3 className="font-display text-base font-bold">{title}</h3> : <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>}
      {children}
    </section>
  )
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.06L2 22l5.1-1.5A9.94 9.94 0 1 0 12.04 2Zm0 18.1a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.03.89.9-2.95-.2-.31a8.1 8.1 0 1 1 6.76 3.68Zm4.44-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.95-1.2 7.3 7.3 0 0 1-1.35-1.68c-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  )
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  )
}
