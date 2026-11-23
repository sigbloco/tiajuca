import { useLayoutEffect, useRef, useState } from 'react'

/** Rótulo de botão com duas versões: mostra `full` se couber na largura do botão; senão, `short`. */
export function FitLabel({ full, short }: { full: string; short: string }) {
  const label = useRef<HTMLSpanElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const btn = label.current?.parentElement
    if (!btn || !probe.current) return
    const check = () => {
      const cs = getComputedStyle(btn)
      const avail = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      setFits(probe.current!.offsetWidth <= avail)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(btn)
    return () => ro.disconnect()
  }, [full])
  return (
    <>
      <span ref={label}>{fits ? full : short}</span>
      <span ref={probe} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 -z-10 whitespace-nowrap">{full}</span>
    </>
  )
}

/** Rótulo com várias versões, da mais longa à mais curta: mostra a primeira que cabe na largura do botão (a última, se nenhuma couber). */
export function FitChoice({ options }: { options: string[] }) {
  const label = useRef<HTMLSpanElement>(null)
  const probes = useRef<(HTMLSpanElement | null)[]>([])
  const [idx, setIdx] = useState(0)
  const key = options.join('|')
  useLayoutEffect(() => {
    const btn = label.current?.parentElement
    if (!btn) return
    const check = () => {
      const cs = getComputedStyle(btn)
      const avail = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const i = probes.current.findIndex((p) => !!p && p.offsetWidth <= avail)
      setIdx(i < 0 ? options.length - 1 : i)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(btn)
    return () => ro.disconnect()
  }, [key])
  return (
    <>
      <span ref={label}>{options[idx]}</span>
      {options.map((o, i) => <span key={o} ref={(el) => { probes.current[i] = el }} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 -z-10 whitespace-nowrap">{o}</span>)}
    </>
  )
}
