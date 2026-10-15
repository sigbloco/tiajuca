import { ChevronDown, Filter, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Button, Card, Input, Select, cn } from '@/components/ui/primitives'

export type StatusFilter = 'all' | 'active' | 'inactive'
export interface FilterValue { search: string; status: StatusFilter }
export const EMPTY_FILTER: FilterValue = { search: '', status: 'all' }

export const matchesStatus = (isActive: boolean, status: StatusFilter) =>
  status === 'all' || (status === 'active' ? isActive : !isActive)
export const matchesText = (text: string, search: string) =>
  !search.trim() || text.toLowerCase().includes(search.trim().toLowerCase())

/** Filtro em formato de funil: botão que abre um painel com busca, situação e filtros extras. */
export function FilterBar({ value, onChange, extraCount = 0, onClearExtra, children }: {
  value: FilterValue
  onChange: (v: FilterValue) => void
  /** Quantos filtros extras (children) estão ativos, para o contador. */
  extraCount?: number
  onClearExtra?: () => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const active = (value.search.trim() ? 1 : 0) + (value.status !== 'all' ? 1 : 0) + extraCount
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant={active ? 'default' : 'outline'} size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Filter className="h-4 w-4" /> Filtrar
          {active > 0 && <Badge className="bg-card text-foreground">{active}</Badge>}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </Button>
        {active > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(EMPTY_FILTER); onClearExtra?.() }}>
            <X className="h-4 w-4" /> Limpar
          </Button>
        )}
      </div>
      {open && (
        <Card className="grid gap-2 p-3 sm:grid-cols-3">
          <Input placeholder="Buscar pelo nome" aria-label="Buscar" value={value.search} onChange={(e) => onChange({ ...value, search: e.target.value })} />
          <Select aria-label="Situação" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as StatusFilter })}>
            <option value="all">Ativos e inativos</option>
            <option value="active">Somente ativos</option>
            <option value="inactive">Somente inativos</option>
          </Select>
          {children}
        </Card>
      )}
    </div>
  )
}
