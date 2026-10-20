import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx, type ClassValue } from 'clsx'
import { X } from 'lucide-react'
import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-card hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-10 px-4', sm: 'h-9 px-3', lg: 'h-12 px-6 text-base', icon: 'h-10 w-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('text-sm font-semibold', className)} {...props} />
)

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-card', className)} {...props} />
)

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
)

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold', className)} {...props} />
)

// Drawer lateral (Sheet) — padrão do projeto para criar/editar sem perder contexto.
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ title, description, children, className }: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  // Regra geral: se o formulário foi mexido e a pessoa tenta fechar sem salvar, pergunta antes.
  const [dirty, setDirty] = useState(false)
  const [asking, setAsking] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const guard = (e: { preventDefault: () => void }) => { if (dirty) { e.preventDefault(); setAsking(true) } }
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={contentRef}
        onEscapeKeyDown={guard}
        onInteractOutside={guard}
        onInputCapture={(e) => {
          const t = e.target as HTMLInputElement
          if (t.closest?.('form') && !t.closest('[data-noguard]') && t.type !== 'search') setDirty(true)
        }}
        onSubmitCapture={() => setDirty(false)}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="font-display text-xl font-bold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground">{description ?? ''}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close ref={closeRef} onClick={guard} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
        {asking && (
          <div role="alertdialog" aria-label="Salvar as alterações?" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-[min(92vw,22rem)] space-y-4 rounded-2xl bg-card p-6 shadow-xl">
              <div>
                <p className="font-display text-xl font-bold">Salvar as alterações?</p>
                <p className="text-sm text-muted-foreground">Você mudou algo aqui e ainda não salvou.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => { setAsking(false); contentRef.current?.querySelector('form')?.requestSubmit() }}>Salvar</Button>
                <Button type="button" variant="outline" onClick={() => { setDirty(false); setAsking(false); setTimeout(() => closeRef.current?.click(), 0) }}>Descartar e fechar</Button>
                <Button type="button" variant="ghost" onClick={() => setAsking(false)}>Continuar editando</Button>
              </div>
            </div>
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'

export const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">{children}</div>
)
