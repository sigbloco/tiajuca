import { Settings } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'

/**
 * Botão de Configurações. Havendo espaço: ícone + "Configurações"; faltando: ícone + "Config."; faltando mais: só o ícone.
 * O teste é feito no próprio navegador: tenta o texto maior e confere se algo da linha (o botão ou os contêineres acima) estoura a largura.
 */
const LEVELS = ['full', 'short', 'none'] as const

export function SettingsButton({ to, active, className, ...rest }: { to?: string; active?: boolean } & Omit<ComponentProps<typeof Button>, 'asChild' | 'variant' | 'size'>) {
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
      <Settings className="h-4 w-4 shrink-0" />
      <span ref={full}>Configurações</span>
      <span ref={short} style={{ display: 'none' }}>Config.</span>
    </>
  )
  const common = { variant: active ? ('default' as const) : ('outline' as const), className, 'aria-label': 'Configurações', title: 'Configurações' }
  return to
    ? <Button asChild {...common}><Link ref={(el) => { ref.current = el }} to={to}>{content}</Link></Button>
    : <Button ref={(el) => { ref.current = el }} {...common} {...rest}>{content}</Button>
}
