import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import type { ThemeArea } from '@/core/themeModel'
import { useQueryClient } from '@tanstack/react-query'

const DEFAULT_PALETTE = ['#E93D2B', '#DEE33B', '#FFFFFF', '#FFF8E7', '#F1F1EE', '#1C1C14']
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** Salva em organizations.theme (com atraso) uma lista de cores: a paleta de fábrica (`area` ausente) ou as cores próprias de uma área. */
function useColorList(area?: ThemeArea) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const theme = membership?.theme
  const remote = (area ? theme?.extras?.[area] : theme?.palette?.length ? theme.palette : DEFAULT_PALETTE) ?? []
  const [list, setLocal] = useState<string[]>(remote)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { setLocal(remote) }, [JSON.stringify(remote)]) // eslint-disable-line react-hooks/exhaustive-deps
  const setList = (next: string[]) => {
    setLocal(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const base = membership?.theme ?? {}
      const nextTheme = area ? { ...base, extras: { ...(base.extras ?? {}), [area]: next } } : { ...base, palette: next }
      const { error } = await supabase.from('organizations').update({ theme: nextTheme }).eq('id', orgId)
      if (error) toast.error(friendlyError(error)); else qc.invalidateQueries({ queryKey: ['memberships'] })
    }, 600)
  }
  return [list, setList] as const
}

const HEX = /^#[0-9A-Fa-f]{6}$/

/** Botão com a cor; abre uma janelinha para escolher no seletor ou digitar o hexadecimal (#RRGGBB). */
export function HexColorButton({ value, onChange, label, className }: { value: string; onChange: (v: string) => void; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  const norm = (t: string) => { const x = t.trim().replace(/^#?/, '#'); return HEX.test(x) ? x.toUpperCase() : null }
  const valid = norm(text)
  return (
    <span className="relative inline-block">
      <button type="button" aria-label={label} title={value} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={className ?? 'h-7 w-9 rounded border border-border'} style={{ backgroundColor: value }} />
      {open && (
        <div role="dialog" aria-label={label} className="absolute left-0 top-full z-50 mt-2 w-60 space-y-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-card">
          <input type="color" aria-label="Seletor de cor" value={valid ?? value} onChange={(e) => { setText(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()) }}
            className="h-20 w-full cursor-pointer rounded border border-border bg-transparent p-0" />
          <label className="block text-xs font-semibold">Hexadecimal
            <input value={text} maxLength={7} spellCheck={false} aria-invalid={!valid} placeholder="#RRGGBB"
              onChange={(e) => { setText(e.target.value); const v = norm(e.target.value); if (v) onChange(v) }}
              className={`mt-1 block min-h-9 w-full rounded-lg border bg-background px-2 font-mono text-sm uppercase ${valid ? 'border-border' : 'border-destructive'}`} />
          </label>
          {!valid && <p className="text-xs text-destructive">Use 6 dígitos, ex.: #E93D2B</p>}
          <button type="button" onClick={() => setOpen(false)} className="min-h-8 w-full rounded-lg border border-border text-sm font-semibold">Fechar</button>
        </div>
      )}
    </span>
  )
}

/** Paleta de fábrica do bloco (organizations.theme.palette). Só é editada/apagada na aba "Cores de fábrica". */
export function usePalette() {
  return useColorList()
}

/**
 * Escolha de cor. Mostra as cores de fábrica (só para escolher) e, depois, as cores criadas nesta área
 * (essas podem ser trocadas e apagadas aqui). "+" cria uma cor só desta área.
 */
export function ColorPick({ label, value, onChange, area }: { label: string; value: string | null; onChange: (v: string | null) => void; area: ThemeArea }) {
  const { membership } = useOrganization()
  const factory = membership?.theme?.palette?.length ? membership.theme.palette : DEFAULT_PALETTE
  const [own, setOwn] = useColorList(area)
  const ownIdx = own.findIndex((c) => same(value, c))
  const swatch = (hex: string, key: string) => (
    <button key={key} type="button" aria-label={`Escolher ${hex}`} title={hex} aria-pressed={same(value, hex)} onClick={() => onChange(hex)}
      className={`h-7 w-7 rounded-full border ${same(value, hex) ? 'border-primary ring-2 ring-primary ring-offset-1' : 'border-border'}`} style={{ backgroundColor: hex }} />
  )
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {factory.map((hex, i) => swatch(hex, `f${i}`))}
        {own.length > 0 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
        {own.map((hex, i) => swatch(hex, `o${i}`))}
        <button type="button" aria-label="Adicionar cor" title="Adicionar cor só desta aba" disabled={own.length >= 12}
          onClick={() => { const n = '#888888'; setOwn([...own, n]); onChange(n) }}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-border hover:bg-muted"><Plus className="h-4 w-4" /></button>
      </div>
      <button type="button" onClick={() => onChange(null)} aria-pressed={value === null}
        className={`min-h-8 rounded-lg border px-2.5 text-sm font-semibold ${value === null ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>Padrão do bloco</button>
      {ownIdx >= 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center gap-2 font-semibold">Trocar esta cor
            <HexColorButton label={`Trocar a cor ${own[ownIdx]}`} value={own[ownIdx]} onChange={(v) => { onChange(v); setOwn(own.map((c, k) => (k === ownIdx ? v : c))) }} />
          </div>
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-destructive hover:underline" onClick={() => { setOwn(own.filter((_, k) => k !== ownIdx)); onChange(null) }}><X className="h-3.5 w-3.5" /> Apagar esta cor</button>
        </div>
      )}
    </div>
  )
}
