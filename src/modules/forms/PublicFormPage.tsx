import { BackButton } from '@/components/shared/BackButton'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { supabase } from '@/core/supabase'
import { applyTheme } from '@/core/theme'
import { isVisible, type Answers, type PublicField, type PublicFormPayload } from './types'

interface UploadedFile { field_key: string; path: string; name: string; mime: string; size: number }
const MAX_BYTES = 5 * 1024 * 1024
const OK_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

function FieldInput({ f, value, onChange, files, onFiles }: {
  f: PublicField
  value: Answers[string]
  onChange: (v: Answers[string]) => void
  files: UploadedFile[]
  onFiles: (fn: (prev: UploadedFile[]) => UploadedFile[], pick: File | null) => void
}) {
  const id = `f-${f.key}`
  const str = typeof value === 'string' ? value : ''
  switch (f.type) {
    case 'short_text': return <Input id={id} value={str} maxLength={f.validation.maxLength ?? 255} onChange={(e) => onChange(e.target.value)} />
    case 'long_text':
      return <textarea id={id} rows={4} maxLength={f.validation.maxLength ?? 5000} value={str} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    case 'email': return <Input id={id} type="email" inputMode="email" autoComplete="email" value={str} onChange={(e) => onChange(e.target.value)} />
    case 'phone': return <PhoneInput id={id} value={str} onChange={onChange} />
    case 'number': return <Input id={id} inputMode="decimal" value={str} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} />
    case 'date': return <DateInput id={id} value={str} onChange={onChange} />
    case 'single_select':
      return f.options.length <= 5 ? (
        <div className="grid gap-2" role="radiogroup" aria-labelledby={`${id}-l`}>
          {f.options.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={str === o.value} onClick={() => onChange(o.value)}
              className={cn('min-h-11 rounded-lg border px-3 text-left font-semibold', str === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <Select id={id} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione…</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )
    case 'multi_select': {
      const cur = Array.isArray(value) ? value : []
      return (
        <div className="grid gap-2">
          {f.options.map((o) => (
            <label key={o.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3">
              <input type="checkbox" className="h-5 w-5" checked={cur.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} />
              {o.label}
            </label>
          ))}
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
            <button key={v} type="button" role="radio" aria-checked={str === v} onClick={() => onChange(v)}
              className={cn('h-11 rounded-lg border font-semibold', str === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>{l}</button>
          ))}
        </div>
      )
    case 'scale': {
      const mn = f.validation.min ?? 1, mx = f.validation.max ?? 5
      return (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: mx - mn + 1 }, (_, i) => mn + i).map((n) => (
            <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}
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
              <span className="truncate">{x.name}</span>
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

/** Formulário público de inscrição: sem login, identidade visual do bloco, validação no servidor. */
export function PublicFormPage() {
  const { orgSlug = '', formSlug = '' } = useParams()
  const [answers, setAnswers] = useState<Answers>({})
  const [consent, setConsent] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [honeypot, setHoneypot] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const token = useRef<string | null>(null)
  const orgId = useRef<string | null>(null)

  const form = useQuery({
    queryKey: ['public-form', orgSlug, formSlug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_form', { p_org_slug: orgSlug, p_form_slug: formSlug })
      if (error) throw error
      const p = data as PublicFormPayload
      if (p.organization?.theme) applyTheme(p.organization.theme, { cache: false })
      return p
    },
  })

  const fields = form.data?.form?.fields ?? []
  const visible = useMemo(() => fields.filter((f) => isVisible(f, answers)), [fields, answers])

  const set = (key: string, v: Answers[string]) => { setAnswers((a) => ({ ...a, [key]: v })); setError('') }
  const handleFiles = async (key: string, fn: (p: UploadedFile[]) => UploadedFile[], pick: File | null) => {
    if (!pick) return setFiles(fn)
    if (pick.size > MAX_BYTES || !OK_MIME.includes(pick.type)) return setError('Arquivo não permitido: use PDF ou imagem de até 5 MB.')
    setUploading(true); setError('')
    try {
      if (!token.current) {
        const { data, error } = await supabase.rpc('begin_form_upload', { p_org_slug: orgSlug, p_form_slug: formSlug })
        if (error) throw error
        const t = data as { token: string; organization_id: string }
        token.current = t.token
        orgId.current = t.organization_id
      }
      const safe = pick.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
      const path = `${orgId.current}/${token.current}/${crypto.randomUUID()}-${safe}`
      const up = await supabase.storage.from('form-uploads').upload(path, pick, { contentType: pick.type, upsert: false })
      if (up.error) throw up.error
      setFiles((p) => [...p, { field_key: key, path, name: pick.name, mime: pick.type, size: pick.size }])
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível enviar o arquivo. Tente novamente.'))
    } finally { setUploading(false) }
  }

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('submit_public_form', {
        p_org_slug: orgSlug, p_form_slug: formSlug, p_answers: Object.fromEntries(visible.filter((f) => f.type !== 'info' && f.type !== 'file').map((f) => [f.key, answers[f.key] ?? null])),
        p_consent: consent, p_hp: honeypot, p_upload_token: token.current, p_files: files.filter((x) => visible.some((f) => f.key === x.field_key)),
      })
      if (error) throw error
      return (data as { message: string }).message
    },
    onSuccess: (m) => { setDone(m); window.scrollTo({ top: 0 }) },
    onError: (e) => { setError(friendlyError(e, 'Não foi possível enviar. Tente novamente.')); window.scrollTo({ top: 0, behavior: 'smooth' }) },
  })

  const org = form.data?.organization
  const f0 = form.data?.form
  const missing = visible.find((f) => f.required && f.type !== 'info' && (f.type === 'file' ? !files.some((x) => x.field_key === f.key)
    : f.type === 'checkbox' ? answers[f.key] !== true : answers[f.key] === undefined || answers[f.key] === '' || (Array.isArray(answers[f.key]) && (answers[f.key] as string[]).length === 0)))

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <BackButton to="/site" name="a página inicial" />
      <div className="mb-4 space-y-2 text-center">
        {org && <OrgLogo name={org.name} logoPath={org.logo_path} className="mx-auto h-24 w-24 ring-4 ring-secondary" />}
        <p className="font-display text-3xl font-extrabold text-primary">{org?.name ?? ''}</p>
      </div>
      {children}
    </main>
  )

  if (form.isLoading) return <Shell><Skeleton className="h-64" /></Shell>
  if (form.isError || form.data?.state === 'not_found') return <Shell><Card className="p-6 text-center"><h1>Formulário não encontrado</h1><p className="text-muted-foreground">Confira o link com a organização.</p></Card></Shell>
  if (done) return <Shell><Card className="space-y-2 p-6 text-center"><h1>Tudo certo!</h1><p className="whitespace-pre-wrap">{done}</p></Card></Shell>
  if (form.data!.state !== 'open') {
    const msg = { not_open: 'As inscrições ainda não abriram.', closed: 'As inscrições estão encerradas.', full: 'As vagas desta inscrição foram preenchidas.' }[form.data!.state as 'not_open' | 'closed' | 'full']
    return <Shell><Card className="space-y-2 p-6 text-center"><h1>{f0?.title}</h1><p className="text-muted-foreground">{msg}</p></Card></Shell>
  }

  return (
    <Shell>
      <form onSubmit={(e) => { e.preventDefault(); if (!missing && !uploading) submit.mutate() }} className="space-y-4" noValidate>
        <Card className="space-y-1 p-5">
          <h1>{f0?.title}</h1>
          {f0?.description && <p className="whitespace-pre-wrap text-muted-foreground">{f0.description}</p>}
          {f0?.closes_at && <p className="text-xs text-muted-foreground">Inscrições até {formatDate(f0.closes_at.slice(0, 10))}.</p>}
          <p className="text-xs text-muted-foreground">Campos com * são obrigatórios.</p>
        </Card>
        {error && <Card role="alert" className="border-destructive p-3 text-destructive">{error}</Card>}

        {visible.map((f) => f.type === 'info' ? (
          <Card key={f.key} className="p-4"><p className="font-semibold">{f.label}</p>{f.description && <p className="whitespace-pre-wrap text-muted-foreground">{f.description}</p>}</Card>
        ) : (
          <Card key={f.key} className="space-y-2 p-4">
            {f.type !== 'checkbox' && <Label htmlFor={`f-${f.key}`} id={`f-${f.key}-l`}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>}
            {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
            <FieldInput f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} files={files}
              onFiles={(fn, pick) => handleFiles(f.key, fn, pick)} />
          </Card>
        ))}

        {f0?.privacy_text && (
          <Card className="space-y-2 p-4">
            <h3>Privacidade e proteção de dados</h3>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{f0.privacy_text}</p>
            {f0.requires_consent && (
              <label className="flex items-start gap-3 pt-1">
                <input type="checkbox" className="mt-0.5 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Li e concordo com o tratamento dos meus dados para esta inscrição. <span className="text-destructive">*</span></span>
              </label>
            )}
          </Card>
        )}

        {/* Armadilha para robôs: invisível para pessoas */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Não preencha este campo<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submit.isPending || uploading || Boolean(missing) || (Boolean(f0?.requires_consent) && !consent)}>
          {submit.isPending ? 'Enviando…' : uploading ? 'Enviando arquivo…' : 'Enviar inscrição'}
        </Button>
        {missing && <p className="text-center text-xs text-muted-foreground">Falta preencher: {missing.label}</p>}
      </form>
    </Shell>
  )
}
