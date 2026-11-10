import { Plus } from 'lucide-react'
import { Label, Select } from '@/components/ui/primitives'
import { useCatalog } from '@/modules/structure/CatalogEditor'
import type { AudienceKind } from './service'

/** Um item do público da chamada. `type` só guarda a escolha do primeiro menu enquanto o segundo ainda está vazio. */
export interface AudRow { kind: AudienceKind; ref: string; type?: string }

const labelOf = (l?: string | null) => l?.trim() || 'Instrumento'

/**
 * Público da chamada: vários itens, cada um com dois menus lado a lado.
 * Primeiro menu: "Naipe" e os tipos de item que os naipes usam (Instrumento, Atividade, Voz…), que se atualizam conforme novos naipes são criados.
 * Vazio = todos os ativos no ciclo.
 */
export function AudiencePicker({ value, onChange }: { value: AudRow[]; onChange: (v: AudRow[]) => void }) {
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const activeSections = (sections.data ?? []).filter((s) => s.is_active)
  const sectionLabel = (id?: string | null) => labelOf(activeSections.find((s) => s.id === id)?.item_label)
  const labels = [...new Set(activeSections.map((s) => labelOf(s.item_label)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const typeOf = (a: AudRow) => a.type ?? (a.kind === 'section' ? 'section' : sectionLabel(instruments.data?.find((i) => i.id === a.ref)?.section_id))
  const optionsFor = (type: string) => type === 'section'
    ? activeSections
    : (instruments.data ?? []).filter((i) => i.is_active && activeSections.some((s) => s.id === i.section_id) && sectionLabel(i.section_id) === type)
  const set = (i: number, patch: Partial<AudRow>) => onChange(value.map((a, k) => (k === i ? { ...a, ...patch } : a)))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>Público da chamada</Label>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Adicionar público" title="Adicionar público"
          onClick={() => onChange([...value, { kind: 'section', ref: '', type: 'section' }])}><Plus className="h-3.5 w-3.5" /></button>
      </div>
      {value.length === 0 && <p className="text-sm text-muted-foreground">Todos os ativos no ciclo.</p>}
      {value.map((a, i) => {
        const type = typeOf(a)
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <Select aria-label="Tipo de público" value={type} onChange={(e) => set(i, { kind: e.target.value === 'section' ? 'section' : 'instrument', ref: '', type: e.target.value })}>
                <option value="section">Naipe</option>
                {labels.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
              <Select aria-label="Público" value={a.ref} onChange={(e) => set(i, { ref: e.target.value })}>
                <option value="">Selecione</option>
                {optionsFor(type).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
            <button type="button" className="shrink-0 rounded px-1.5 text-lg leading-none text-muted-foreground hover:text-destructive" aria-label="Remover público" title="Remover" onClick={() => onChange(value.filter((_, k) => k !== i))}>×</button>
          </div>
        )
      })}
    </div>
  )
}
