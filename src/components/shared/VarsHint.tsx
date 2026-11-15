import { TEXT_VARS } from '@/core/textVars'

/** Lista as variáveis que dá para escrever num texto de formulário: o valor atual do bloco entra sozinho. */
export function VarsHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Variáveis (valem na hora de mostrar): {TEXT_VARS.map((v, i) => <span key={v.key} title={v.help}>{i > 0 && ', '}<code className="rounded bg-muted px-1">{`{${v.key}}`}</code></span>)}.
    </p>
  )
}
