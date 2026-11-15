import { useCatalog } from '@/modules/structure/CatalogEditor'
import { TEXT_VARS } from '@/core/textVars'

/** Lista as variáveis que dá para escrever num texto de formulário: o valor atual do bloco entra sozinho. */
export function VarsHint() {
  const cats = useCatalog('fee_categories')
  const names = (cats.data ?? []).filter((c) => c.is_active && !c.is_exempt && c.name !== 'Isento').map((c) => c.name)
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <p>Variáveis (valem na hora de mostrar): {TEXT_VARS.map((v, i) => <span key={v.key} title={v.help}>{i > 0 && ', '}<code className="rounded bg-muted px-1">{`{${v.key}}`}</code></span>)}.</p>
      {names.length > 0 && <p>Valor de uma categoria específica: {names.map((n, i) => <span key={n}>{i > 0 && ', '}<code className="rounded bg-muted px-1">{`{valor:${n}}`}</code></span>)}.</p>}
    </div>
  )
}
