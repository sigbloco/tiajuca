import { useCatalog } from '@/modules/structure/CatalogEditor'
import { TEXT_VARS } from '@/core/textVars'

function Chip({ text, help, onInsert }: { text: string; help: string; onInsert: (t: string) => void }) {
  return (
    <button type="button" title={help} onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(text)}
      className="my-0.5 inline-block rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-primary/10 hover:text-primary">{text}</button>
  )
}

/** Lista as variáveis que dá para escrever num texto de formulário: o valor atual do bloco entra sozinho. */
export function VarsHint({ onInsert }: { /** Clicar numa variável coloca ela onde está o cursor do texto. */ onInsert: (text: string) => void }) {
  const cats = useCatalog('fee_categories')
  const names = (cats.data ?? []).filter((c) => c.is_active && !c.is_exempt && c.name !== 'Isento').map((c) => c.name)
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p>Inserir variável {TEXT_VARS.map((v, i) => <span key={v.key}>{i > 0 && ' '}<Chip text={`{${v.key}}`} help={v.help} onInsert={onInsert} /></span>)}.</p>
      {names.length > 0 && <p>{names.map((n, i) => <span key={n}>{i > 0 && ' '}<Chip text={`{valor:${n}}`} help={`valor atual de ${n}`} onInsert={onInsert} /></span>)}.</p>}
    </div>
  )
}
