import { useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Rótulo do chip da equipe. Cabendo, fica tudo lado a lado: "Nome (apelido) · Função · $".
 * Se quebrar linha, a linha 1 fica só com o nome e a linha 2 com "Função · $" (sem o ponto sobrando no começo).
 */
export function StaffChipLabel({ name, role }: { name: ReactNode; role: ReactNode }) {
  const wrap = useRef<HTMLSpanElement>(null)
  const nameEl = useRef<HTMLSpanElement>(null)
  const roleEl = useRef<HTMLSpanElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const w = wrap.current, a = nameEl.current, b = roleEl.current, d = dot.current
    if (!w || !a || !b || !d) return
    const fit = () => {
      d.style.display = ''
      // Quebrou: a função foi para a linha de baixo, então o ponto separador não faz sentido.
      if (b.offsetTop > a.offsetTop + 2) d.style.display = 'none'
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(w)
    return () => ro.disconnect()
  }, [name, role])
  return (
    <span ref={wrap} className="flex min-w-0 flex-wrap items-center gap-x-1">
      <span ref={nameEl}>{name}</span>
      <span ref={roleEl} className="whitespace-nowrap"><span ref={dot}>· </span>{role}</span>
    </span>
  )
}
