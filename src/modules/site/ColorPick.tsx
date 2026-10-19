import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useQueryClient } from '@tanstack/react-query'

const DEFAULT_PALETTE = ['#E93D2B', '#DEE33B', '#FFFFFF', '#FFF8E7', '#F1F1EE', '#1C1C14']
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** Paleta de cores do bloco (guardada em organizations.theme.palette): toda cor pode ser trocada ou removida, e dá para adicionar mais. */
export function usePalette() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const remote = membership?.theme?.palette?.length ? membership.theme.palette : DEFAULT_PALETTE
  const [palette, setLocal] = useState<string[]>(remote)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { setLocal(remote) }, [JSON.stringify(remote)]) // eslint-disable-line react-hooks/exhaustive-deps
  const setPalette = (next: string[]) => {
    setLocal(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from('organizations').update({ theme: { ...(membership?.theme ?? {}), palette: next } }).eq('id', orgId)
      if (error) toast.error(friendlyError(error)); else qc.invalidateQueries({ queryKey: ['memberships'] })
    }, 600)
  }
  return [palette, setPalette] as const
}

/** Escolha de cor a partir da paleta. Cada cor: clique escolhe, a bolinha do canto edita, o X remove; "+" cria outra. */
export function ColorPick({ label, value, onChange, hideDefault }: { label: string; value: string | null; onChange: (v: string | null) => void; hideDefault?: boolean }) {
  const [palette, setPalette] = usePalette()
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {!hideDefault && (
          <button type="button" onClick={() => onChange(null)} aria-pressed={value === null}
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${value === null ? 'border-primary ring-2 ring-primary' : 'border-border'}`}>Padrão do bloco</button>
        )}
        {palette.map((hex, i) => (
          <span key={i} className="relative inline-block">
            <button type="button" aria-label={`Escolher ${hex}`} aria-pressed={same(value, hex)} onClick={() => onChange(hex)}
              className={`h-11 w-11 rounded-full border ${same(value, hex) ? 'border-primary ring-2 ring-primary' : 'border-border'}`} style={{ backgroundColor: hex }} />
            <input type="color" aria-label={`Editar a cor ${hex}`} title="Editar esta cor" value={hex} className="absolute -bottom-1 -right-1 h-5 w-5 cursor-pointer rounded-full border border-border bg-card p-0"
              onChange={(e) => { const v = e.target.value.toUpperCase(); if (same(value, hex)) onChange(v); setPalette(palette.map((c, k) => (k === i ? v : c))) }} />
            {palette.length > 1 && (
              <button type="button" aria-label={`Remover ${hex}`} title="Remover" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card"
                onClick={() => setPalette(palette.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
            )}
          </span>
        ))}
        <button type="button" aria-label="Adicionar cor" title="Adicionar cor" disabled={palette.length >= 24}
          onClick={() => { const n = '#888888'; setPalette([...palette, n]); onChange(n) }}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border hover:bg-muted"><Plus className="h-5 w-5" /></button>
      </div>
    </div>
  )
}
