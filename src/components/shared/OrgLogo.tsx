import { cn } from '@/components/ui/primitives'

/** Logo da organização (URL guardada em `logo_path`); sem logo, círculo com a inicial na cor do bloco. */
export function OrgLogo({ name, logoPath, className }: { name?: string | null; logoPath?: string | null; className?: string }) {
  if (logoPath) return <img src={logoPath} alt={name ? `Logo ${name}` : 'Logo'} className={cn('rounded-full object-cover', className)} />
  return (
    <div aria-hidden className={cn('flex items-center justify-center rounded-full bg-secondary font-display font-extrabold text-secondary-foreground', className)}>
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}
