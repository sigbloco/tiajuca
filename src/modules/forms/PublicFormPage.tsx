import { BackButton } from '@/components/shared/BackButton'
import { RichText } from '@/components/shared/RichText'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { supabase } from '@/core/supabase'
import { applyTheme } from '@/core/theme'
import { hasConsent, isSection, isVisible, type Answers, type PublicField, type PublicFormPayload } from './types'

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
          <option value="">Selecione</option>
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

/** Formulário público de inscrição: sem login, identidade visual do bloco, validação no servidor. */
export function PublicFormPage({ preview }: { /** Pré-visualização: usa estes dados em vez do servidor e não envia nada. */ preview?: PublicFormPayload } = {}) {
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

  const live = useQuery({
    queryKey: ['public-form', orgSlug, formSlug],
    enabled: !preview,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_form', { p_org_slug: orgSlug, p_form_slug: formSlug })
      if (error) throw error
      const p = data as PublicFormPayload
      if (p.organization?.theme) applyTheme(p.organization.theme, { cache: false })
      return p
    },
  })

  const form = preview ? { data: preview, isLoading: false, isError: false } : live
  const fields = form.data?.form?.fields ?? []
  const visible = useMemo(() => fields.filter((f) => isVisible(f, answers)), [fields, answers])

  // Seções: cada cabeçalho abre um bloco com as perguntas que vêm depois dele (perguntas antes da primeira seção ficam num bloco sem título).
  const blocks = useMemo(() => {
    const out: { head: PublicField | null; items: PublicField[] }[] = []
    for (const f of visible) {
      if (isSection(f)) out.push({ head: f, items: [] })
      else { if (out.length === 0) out.push({ head: null, items: [] }); out[out.length - 1].items.push(f) }
    }
    return out
  }, [visible])
  const hasConsentBlock = visible.some(hasConsent)
  // Uma seção por vez: só avança quando a seção atual está completa.
  const [step, setStep] = useState(0)
  const stepIdx = Math.min(step, Math.max(0, blocks.length - 1))
  const isLast = stepIdx >= blocks.length - 1

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
      if (preview) return 'Pré-visualização: nada foi enviado.'
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
  const isEmpty = (f: PublicField) => f.required && f.type !== 'info' && (f.type === 'file' ? !files.some((x) => x.field_key === f.key)
    : f.type === 'checkbox' ? answers[f.key] !== true : answers[f.key] === undefined || answers[f.key] === '' || (Array.isArray(answers[f.key]) && (answers[f.key] as string[]).length === 0))
  /** O que falta na seção bi (nome da pergunta ou o aceite), ou null se está completa. */
  const pendingOf = (bi: number): string | null => {
    const blk = blocks[bi]
    if (!blk) return null
    const miss = blk.items.find(isEmpty)
    if (miss) return miss.label
    const hasConsentHere = (blk.head ? hasConsent(blk.head) : false) || (bi === blocks.length - 1 && !hasConsentBlock && Boolean(f0?.privacy_text))
    if (hasConsentHere && f0?.requires_consent && !consent) return 'concordar com o tratamento dos dados'
    return null
  }
  const go = (to: number, msg = '') => { setStep(to); setError(msg); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const next = () => { const m = pendingOf(stepIdx); if (m) setError(`Falta preencher: ${m}`); else go(stepIdx + 1) }
  const finish = () => {
    if (uploading || submit.isPending) return
    for (let i = 0; i < blocks.length; i++) { const m = pendingOf(i); if (m) return go(i, `Falta preencher: ${m}`) }
    submit.mutate()
  }
  const pct = blocks.length > 0 ? Math.round(((stepIdx + 1) / blocks.length) * 100) : 100

  const progress = blocks.length > 1 ? (
    <div className="space-y-1.5 pt-2">
      <p className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{blocks[stepIdx]?.head?.label ?? f0?.title}</span><span className="text-muted-foreground">Etapa {stepIdx + 1} de {blocks.length}</span>
      </p>
      <div role="progressbar" aria-label="Progresso do formulário" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  ) : null

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      {preview ? <p role="status" className="mb-3 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-semibold text-secondary-foreground">Pré-visualização: é assim que o formulário aparece para quem se inscreve. Nada é enviado.</p> : <BackButton to="/site" name="a página inicial" />}
      <header className="sticky top-0 z-20 -mx-4 mb-4 bg-background/95 px-4 pb-2 pt-2 backdrop-blur">
        <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3">
          {f0?.header_image_url && (
            <>
              {/* Foto de fundo: desfoque de 1 px, escurecida, com degradê de transparente (em cima) para o vermelho da marca (embaixo) */}
              <div aria-hidden className="absolute inset-0 scale-105 bg-cover bg-center blur-[1px] brightness-75" style={{ backgroundImage: `url(${f0.header_image_url})` }} />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/80" />
            </>
          )}
          {org && <OrgLogo name={org.name} logoPath={org.logo_path} className="relative h-16 w-16 shrink-0 shadow-lg shadow-black/40" />}
          {f0 && (
            <div className={`relative min-w-0 text-left ${f0.header_image_url ? 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]' : ''}`}>
              <h1 className="font-display text-lg font-extrabold leading-tight sm:text-xl">{f0.title}</h1>
              <p className={`text-xs ${f0.header_image_url ? '' : 'text-muted-foreground'}`}>Campos com * são obrigatórios.{f0.closes_at ? ` Inscrições até ${formatDate(f0.closes_at.slice(0, 10))}.` : ''}</p>
            </div>
          )}
        </div>
        {progress}
      </header>
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
      <form onSubmit={(e) => { e.preventDefault(); if (isLast) finish(); else next() }} className="space-y-4" noValidate>
        {stepIdx === 0 && f0?.description && <Card className="p-5"><RichText text={f0.description} /></Card>}
        {error && <Card role="alert" className="border-destructive p-3 text-destructive">{error}</Card>}

        {blocks.filter((_, bi) => bi === stepIdx).map((b, bi) => (
          <section key={b.head?.key ?? `b${bi}`} className="space-y-3" aria-label={b.head?.label}>
            {b.head && (
              <div className="space-y-3 border-l-4 border-primary pl-3 pt-2">
                <h2 className="font-display text-2xl font-extrabold">{b.head.label}</h2>
                {b.head.description && <RichText text={b.head.description} />}
              </div>
            )}
            {b.items.map((f) => f.type === 'info' ? (
              <div key={f.key} className="space-y-2">
                <p className="font-display text-lg font-bold">{f.label}</p>
                {f.description && <Card className="p-4"><RichText text={f.description} /></Card>}
              </div>
            ) : (
              <Card key={f.key} className="space-y-2 p-4">
                {f.type !== 'checkbox' && <Label htmlFor={`f-${f.key}`} id={`f-${f.key}-l`} className="font-display text-lg font-bold">{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>}
                {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                <FieldInput f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} files={files}
                  onFiles={(fn, pick) => handleFiles(f.key, fn, pick)} />
              </Card>
            ))}
            {b.head && hasConsent(b.head) && (
              <Card className="space-y-2 p-4">
                {f0?.privacy_text && <><h3>Privacidade e proteção de dados</h3><RichText text={f0.privacy_text} className="text-xs text-muted-foreground" /></>}
                {f0?.requires_consent && (
                  <label className="flex items-start gap-3 pt-1">
                    <input type="checkbox" className="mt-0.5 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>Estou ciente e concordo <span className="text-destructive">*</span></span>
                  </label>
                )}
              </Card>
            )}
          </section>
        ))}

        {isLast && f0?.privacy_text && !hasConsentBlock && (
          <Card className="space-y-2 p-4">
            <h3>Privacidade e proteção de dados</h3>
            <RichText text={f0.privacy_text} className="text-xs text-muted-foreground" />
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

        <div className="flex gap-2">
          {stepIdx > 0 && <Button type="button" size="lg" variant="outline" className="flex-1" onClick={() => go(stepIdx - 1)}><ArrowLeft className="h-4 w-4" /> Voltar</Button>}
          {isLast
            ? <Button type="submit" size="lg" className="flex-1" disabled={submit.isPending || uploading}>{submit.isPending ? 'Enviando' : uploading ? 'Enviando arquivo' : 'Enviar inscrição'}</Button>
            : <Button type="submit" size="lg" className="flex-1" disabled={uploading}>Próximo <ArrowRight className="h-4 w-4" /></Button>}
        </div>
      </form>
    </Shell>
  )
}
