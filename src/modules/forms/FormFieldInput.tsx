import { Plus, X } from 'lucide-react'
import { SOCIAL_NETWORKS, networkUrl, splitNetwork, type Network } from '@/core/social'
import { useState } from 'react'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Input, Select, cn } from '@/components/ui/primitives'
import { type Answers, type PublicField } from './types'

export interface UploadedFile { field_key: string; path: string; name: string; mime: string; size: number }

/** Redes sociais: escolher a rede (padrão Instagram) e, embaixo, o nome de usuário. Dá para adicionar mais de uma. O valor guardado são os links, um por linha. */
export function SocialInput({ id, value, onChange, networks, defs }: { id: string; value: string; onChange: (v: string) => void; networks?: string[]; defs?: Network[] }) {
  const known = defs?.length ? defs : SOCIAL_NETWORKS
  const options = known.filter((n) => !networks?.length || networks.includes(n.key))
  const first = (options[0] ?? known[0]).key
  const [rows, setRows] = useState<{ network: string; user: string }[]>(() => {
    const parsed = value.split('\n').map((l) => l.trim()).filter(Boolean).map((u) => splitNetwork(u, known))
    return parsed.length > 0 ? parsed : [{ network: first, user: '' }]
  })
  const update = (next: { network: string; user: string }[]) => {
    setRows(next)
    onChange(next.map((r) => networkUrl(r.network, r.user, known)).filter(Boolean).join('\n'))
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
          <div className="flex items-center gap-2">
            <Select aria-label="Rede social" id={i === 0 ? id : undefined} value={r.network} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))}>
              {options.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </Select>
            {rows.length > 1 && <Button type="button" size="icon" variant="ghost" aria-label="Remover rede social" onClick={() => update(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
          </div>
          <Input aria-label="Nome de usuário" placeholder="Nome de usuário (ex.: @nomedobloco)" autoCapitalize="none" autoCorrect="off" value={r.user} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update([...rows, { network: first, user: '' }])}><Plus className="h-4 w-4" /> Adicionar rede social</Button>
    </div>
  )
}

/** Resposta de seleção com "Outro": guardada como "outro: texto". */
export const OTHER = 'outro:'

export const isOtherVal = (x: unknown): x is string => typeof x === 'string' && x.startsWith(OTHER)

export function FieldInput({ f, value, onChange, files, onFiles }: {
  f: PublicField
  value: Answers[string]
  onChange: (v: Answers[string]) => void
  files: UploadedFile[]
  onFiles: (fn: (prev: UploadedFile[]) => UploadedFile[], pick: File | null) => void
}) {
  const id = `f-${f.key}`
  const str = typeof value === 'string' ? value : ''
  if (f.type === 'long_text' && f.validation.social) return <SocialInput id={id} value={str} onChange={onChange} networks={f.validation.networks} defs={f.validation.networkDefs} />
  switch (f.type) {
    case 'short_text': return <Input id={id} value={str} maxLength={f.validation.maxLength ?? 255} onChange={(e) => onChange(e.target.value)} />
    case 'long_text':
      return <textarea id={id} rows={4} maxLength={f.validation.maxLength ?? 5000} value={str} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    case 'email': return <Input id={id} type="email" inputMode="email" autoComplete="email" value={str} onChange={(e) => onChange(e.target.value)} />
    case 'phone': return <PhoneInput id={id} value={str} onChange={onChange} />
    case 'number': return <Input id={id} inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} />
    case 'date': return <DateInput id={id} value={str} onChange={onChange} />
    case 'single_select': {
      const other = Boolean(f.validation.other)
      const isOther = isOtherVal(str)
      const otherInput = isOther ? <Input id={`${id}-outro`} aria-label="Outro: escreva aqui" placeholder="Escreva aqui" maxLength={280} value={str.slice(OTHER.length)} onChange={(e) => onChange(OTHER + e.target.value)} /> : null
      return f.options.length + (other ? 1 : 0) <= 5 ? (
        <div className="grid gap-2" role="radiogroup" aria-labelledby={`${id}-l`}>
          {f.options.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={str === o.value} onClick={() => onChange(str === o.value ? '' : o.value)}
              className={cn('min-h-11 rounded-lg border px-3 py-2 text-left font-semibold', str === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
              {o.label}
              {o.description && <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{o.description}</span>}
            </button>
          ))}
          {other && (
            <button type="button" role="radio" aria-checked={isOther} onClick={() => onChange(isOther ? '' : OTHER)}
              className={cn('min-h-11 rounded-lg border px-3 text-left font-semibold', isOther ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>Outro</button>
          )}
          {otherInput}
        </div>
      ) : (
        <div className="grid gap-2">
          <Select id={id} value={isOther ? '__outro__' : str} onChange={(e) => onChange(e.target.value === '__outro__' ? OTHER : e.target.value)}>
            <option value="">Selecione</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {other && <option value="__outro__">Outro</option>}
          </Select>
          {!isOther && f.options.find((o) => o.value === str)?.description && <p className="text-sm text-muted-foreground">{f.options.find((o) => o.value === str)?.description}</p>}
          {otherInput}
        </div>
      )
    }
    case 'multi_select': {
      const cur = Array.isArray(value) ? value : []
      const plain = cur.filter((x: string) => !x.startsWith(OTHER))
      const otherVal = cur.find((x: string) => x.startsWith(OTHER))
      return (
        <div className="grid gap-2">
          {f.options.map((o) => (
            <label key={o.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3">
              <input type="checkbox" className="h-5 w-5" checked={plain.includes(o.value)} onChange={(e) => onChange([...(e.target.checked ? [...plain, o.value] : plain.filter((x) => x !== o.value)), ...(otherVal !== undefined ? [otherVal] : [])])} />
              <span>{o.label}{o.description && <span className="block text-sm text-muted-foreground">{o.description}</span>}</span>
            </label>
          ))}
          {f.validation.other && (
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3">
              <input type="checkbox" className="h-5 w-5" checked={otherVal !== undefined} onChange={(e) => onChange(e.target.checked ? [...plain, OTHER] : plain)} />
              Outro
            </label>
          )}
          {otherVal !== undefined && <Input aria-label="Outro: escreva aqui" placeholder="Escreva aqui" maxLength={280} value={otherVal.slice(OTHER.length)} onChange={(e) => onChange([...plain, OTHER + e.target.value])} />}
        </div>
      )
    }
    case 'checkbox':
      return (
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3">
          <input id={id} type="checkbox" className="h-5 w-5" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {f.label}
        </label>
      )
    case 'yes_no':
      return (
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {[['yes', 'Sim'], ['no', 'Não']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={str === v} onClick={() => onChange(str === v ? '' : v)}
              className={cn('h-11 rounded-lg border font-semibold', str === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>{l}</button>
          ))}
        </div>
      )
    case 'scale': {
      const mn = f.validation.min ?? 1, mx = f.validation.max ?? 5
      return (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: mx - mn + 1 }, (_, i) => mn + i).map((n) => (
            <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(value === n ? '' : n)}
              className={cn('h-11 w-11 rounded-lg border font-semibold', value === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>{n}</button>
          ))}
        </div>
      )
    }
    case 'file': {
      const mine = files.filter((x) => x.field_key === f.key)
      return (
        <div className="space-y-2">
          {mine.map((x) => (
            <div key={x.path} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <span className="break-words">{x.name}</span>
              <button type="button" className="text-destructive" onClick={() => onFiles((p) => p.filter((y) => y.path !== x.path), null)}>Remover</button>
            </div>
          ))}
          {mine.length < 3 && (
            <input id={id} type="file" accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onFiles((p) => p, file) }} />
          )}
          <p className="text-xs text-muted-foreground">PDF ou imagem, até 5 MB, no máximo 3 arquivos.</p>
        </div>
      )
    }
    default: return null
  }
}
