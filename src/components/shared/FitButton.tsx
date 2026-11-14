import type { LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'

/**
 * Botão com ícone e texto que se adapta ao espaço: havendo espaço, ícone + texto; faltando, ícone + texto curto (se houver); faltando mais, só o ícone.
 * O teste é feito no próprio navegador: tenta o texto maior e confere se algo da linha (o botão ou os contêineres acima) estoura a largura.
 */
const LEVELS = ['full', 'short', 'none'] as const

export function FitButton({ icon: Icon, label, shortLabel, hint, to, href, newTab, active, className, ...rest }: {
  icon: LucideIcon; label: string; shortLabel?: string; /** Nome completo para leitores de tela e dica (padrão: o texto do botão). */ hint?: string; to?: string; href?: string; newTab?: boolean; active?: boolean
} & Omit<ComponentProps<typeof Button>, 'asChild' | 'variant' | 'size'>) {
  const ref = useRef<HTMLElement | null>(null)
  const full = useRef<HTMLSpanElement>(null)
  const short = useRef<HTMLSpanElement>(null)

  const fit = () => {
    const btn = ref.current
    if (!btn || !full.current || !short.current) return
    // Contêineres acima que podem quebrar linha: no teste não quebram, para o estouro aparecer.
    const chain: HTMLElement[] = []
    for (let a = btn.parentElement; a && chain.length < 4 && a !== document.body; a = a.parentElement) chain.push(a)
    const saved = chain.map((a) => a.style.flexWrap)
    chain.forEach((a) => { if (getComputedStyle(a).display.includes('flex')) a.style.flexWrap = 'nowrap' })
    const overflows = () => btn.scrollWidth > btn.clientWidth + 0.5 || chain.some((a) => a.scrollWidth > a.clientWidth + 0.5)
    let chosen: (typeof LEVELS)[number] = 'none'
    for (const level of LEVELS) {
      if (level === 'short' && !shortLabel) continue
      full.current.style.display = level === 'full' ? '' : 'none'
      short.current.style.display = level === 'short' ? '' : 'none'
      if (!overflows()) { chosen = level; break }
    }
    full.current.style.display = chosen === 'full' ? '' : 'none'
    short.current.style.display = chosen === 'short' ? '' : 'none'
    chain.forEach((a, i) => { a.style.flexWrap = saved[i] })
  }
  useLayoutEffect(fit)
  useEffect(() => {
    const btn = ref.current
    if (!btn) return
    const ro = new ResizeObserver(fit)
    for (let a = btn.parentElement, n = 0; a && n < 4; a = a.parentElement, n++) ro.observe(a)
    return () => ro.disconnect()
  })

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span ref={full}>{label}</span>
      <span ref={short} style={{ display: 'none' }}>{shortLabel}</span>
    </>
  )
  const common = { variant: active ? ('default' as const) : ('outline' as const), className, 'aria-label': hint ?? label, title: hint ?? label }
  const setRef = (el: HTMLElement | null) => { ref.current = el }
  if (to) return <Button asChild {...common}><Link ref={setRef} to={to}>{content}</Link></Button>
  if (href) return <Button asChild {...common}><a ref={setRef} href={href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined}>{content}</a></Button>
  return <Button ref={setRef} {...common} {...rest}>{content}</Button>
}
