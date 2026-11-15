import type { CSSProperties } from 'react'
import { cn } from '@/components/ui/primitives'

/** Logo da organização (URL guardada em `logo_path`); sem logo, círculo com a inicial na cor do bloco. */
export function OrgLogo({ name, logoPath, className, style }: { name?: string | null; logoPath?: string | null; className?: string; style?: CSSProperties }) {
  if (logoPath) return <img src={logoPath} alt={name ? `Logo ${name}` : 'Logo'} className={cn('rounded-full object-cover', className)} style={style} />
  return (
    <div aria-hidden className={cn('flex items-center justify-center rounded-full bg-secondary font-display font-extrabold text-secondary-foreground', className)} style={style}>
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}
