import { useCatalog } from '@/modules/structure/CatalogEditor'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { TEXT_VARS } from '@/core/textVars'

function Chip({ text, help, onInsert }: { text: string; help: string; onInsert: (t: string) => void }) {
  return (
    <button type="button" title={help} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(text)}
      className="my-0.5 inline-block rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-primary/10 hover:text-primary">{text}</button>
  )
}

/** Lista as variáveis que dá para escrever num texto de formulário: o valor atual do bloco entra sozinho. */
export function VarsHint({ onInsert, valueVars = true }: { /** Clicar numa variável coloca ela onde está o cursor do texto. */ onInsert: (text: string) => void; /** As variáveis de valor dependem do ciclo do formulário: sem ciclo, não aparecem. */ valueVars?: boolean }) {
  const cats = useCatalog('fee_categories')
  const funcs = useCatalog('artistic_functions')
  // Categorias de funções isentas (Escritora, Monitor, direção...) não pagam: não sugere variável de valor para elas.
  const exemptFns = (funcs.data ?? []).filter((f) => f.is_exempt || f.exempt_locked)
  const exemptIds = new Set(exemptFns.map((f) => f.id))
  const exemptNames = new Set(exemptFns.map((f) => f.name.toLowerCase()))
  const names = (cats.data ?? []).filter((c) => c.is_active && !c.is_exempt && c.name !== 'Isento' && !(c.function_id && exemptIds.has(c.function_id)) && !exemptNames.has(c.name.toLowerCase())).map((c) => c.name)
  // Grupos recolhíveis (fechados por padrão): a lista de variáveis só cresce.
  const group = (title: string, count: number, children: ReactNode) => count === 0 ? null : (
    <details className="group rounded-md border border-border bg-card">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-2 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden /> {title} <span className="font-normal text-muted-foreground">({count})</span>
      </summary>
      <p className="px-2 pb-2">{children}</p>
    </details>
  )
  const chip = (v: (typeof TEXT_VARS)[number]) => <span key={v.key}><Chip text={`{${v.key}}`} help={v.help} onInsert={onInsert} /> </span>
  const general = TEXT_VARS.filter((v) => !v.needsCycle)
  const cycleVars = valueVars ? TEXT_VARS.filter((v) => v.needsCycle) : []
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>Inserir variável:</p>
      {group('Do bloco e do formulário', general.length, general.map(chip))}
      {group('Do ciclo', cycleVars.length, cycleVars.map(chip))}
      {group('Valor de cada categoria', valueVars ? names.length : 0, names.map((n) => <span key={n}><Chip text={`{valor:${n}}`} help={`valor de ${n} no ciclo do formulário`} onInsert={onInsert} /> </span>))}
    </div>
  )
}
