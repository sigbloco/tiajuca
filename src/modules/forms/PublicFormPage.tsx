import { BackButton } from '@/components/shared/BackButton'
import { DEFAULT_FRAME, HeaderBand } from './HeaderBand'
import { RichText } from '@/components/shared/RichText'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react'
import { SOCIAL_NETWORKS, networkUrl, splitNetwork } from '@/core/social'
import { useAuth } from '@/core/auth'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DateInput, PhoneInput } from '@/components/ui/masked-inputs'
import { Button, Card, Input, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { supabase } from '@/core/supabase'
import { applyTheme } from '@/core/theme'
import { hasConsent, isLoginSection, isSection, isVisible, type Answers, type PublicField, type PublicFormPayload } from './types'

interface UploadedFile { field_key: string; path: string; name: string; mime: string; size: number }
const MAX_BYTES = 5 * 1024 * 1024
const OK_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Redes sociais: escolher a rede (padrão Instagram) e, embaixo, o nome de usuário. Dá para adicionar mais de uma. O valor guardado são os links, um por linha. */
function SocialInput({ id, value, onChange, networks }: { id: string; value: string; onChange: (v: string) => void; networks?: string[] }) {
  const options = SOCIAL_NETWORKS.filter((n) => !networks?.length || networks.includes(n.key))
  const first = (options[0] ?? SOCIAL_NETWORKS[0]).key
  const [rows, setRows] = useState<{ network: string; user: string }[]>(() => {
    const parsed = value.split('\n').map((l) => l.trim()).filter(Boolean).map(splitNetwork)
    return parsed.length > 0 ? parsed : [{ network: first, user: '' }]
  })
  const update = (next: { network: string; user: string }[]) => {
    setRows(next)
    onChange(next.map((r) => networkUrl(r.network, r.user)).filter(Boolean).join('\n'))
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
          <Input aria-label="Nome de usuário" placeholder="Nome de usuário (ex.: @cordaodatiajuca)" autoCapitalize="none" autoCorrect="off" value={r.user} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => update([...rows, { network: first, user: '' }])}><Plus className="h-4 w-4" /> Adicionar rede social</Button>
    </div>
  )
}

/** Resposta de seleção com "Outro": guardada como "outro: texto". */
const OTHER = 'outro:'
const isOtherVal = (x: unknown): x is string => typeof x === 'string' && x.startsWith(OTHER)

const cleanAnswer = (v: Answers[string]): Answers[string] | null => {
  if (v === undefined) return null
  if (typeof v === 'string' && v.trim() === OTHER) return null
  if (Array.isArray(v)) { const k = v.filter((x) => x !== OTHER); return k.length ? k : null }
  return v
}

function FieldInput({ f, value, onChange, files, onFiles }: {
  f: PublicField
  value: Answers[string]
  onChange: (v: Answers[string]) => void
  files: UploadedFile[]
  onFiles: (fn: (prev: UploadedFile[]) => UploadedFile[], pick: File | null) => void
}) {
  const id = `f-${f.key}`
  const str = typeof value === 'string' ? value : ''
  if (f.type === 'long_text' && f.validation.social) return <SocialInput id={id} value={str} onChange={onChange} networks={f.validation.networks} />
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
            <button key={o.value} type="button" role="radio" aria-checked={str === o.value} onClick={() => onChange(o.value)}
              className={cn('min-h-11 rounded-lg border px-3 text-left font-semibold', str === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}>
              {o.label}
            </button>
          ))}
          {other && (
            <button type="button" role="radio" aria-checked={isOther} onClick={() => onChange(OTHER)}
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
              {o.label}
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
  const [showErrors, setShowErrors] = useState(false)
  const { session, signInWithGoogle, signOut } = useAuth()
  const draftKey = `form-draft:${window.location.pathname}`
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
  const signedIn = Boolean(session)
  // Uma seção por vez: só avança quando a seção atual está completa.
  const [step, setStep] = useState(0)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw) as { answers?: Answers; step?: number; consent?: boolean }
      if (d.answers) setAnswers(d.answers)
      if (typeof d.step === 'number') setStep(d.step)
      if (d.consent) setConsent(true)
    } catch { /* sem rascunho */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const goLogin = () => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ answers, step, consent })) } catch { /* sem armazenamento */ }
    void signInWithGoogle(window.location.pathname + window.location.search).catch((e) => setError(friendlyError(e)))
  }
  const stepIdx = Math.min(step, Math.max(0, blocks.length - 1))
  // Título e subtítulo: quando o usuário rola além do cartão do título (ou está numa etapa sem ele), passam para o cabeçalho fixo, abaixo do progresso.
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null)
  const [titlePast, setTitlePast] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  // Navegação pelos blocos informativos da etapa: clicar rola até o bloco; o da vez "acende" conforme a página rola.
  const anchors = (blocks[stepIdx]?.items ?? []).filter((f) => f.type === 'info').map((f) => ({ key: f.key, label: f.label }))
  const anchorKeys = anchors.map((a) => a.key).join('|')
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  useEffect(() => {
    if (!anchorKeys) { setActiveAnchor(null); return }
    const keys = anchorKeys.split('|')
    let raf = 0
    const update = () => {
      raf = 0
      const line = (headerRef.current?.offsetHeight ?? 0) + 24
      let cur: string | null = null
      for (const k of keys) { const el = document.getElementById(`bloco-${k}`); if (el && el.getBoundingClientRect().top <= line) cur = k }
      // No fim da página o último bloco nunca chega até a linha: ali ele vale como o atual.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && window.scrollY > 0) cur = keys[keys.length - 1]
      setActiveAnchor(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [anchorKeys, stepIdx])
  const goAnchor = (k: string) => {
    const el = document.getElementById(`bloco-${k}`)
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (headerRef.current?.offsetHeight ?? 0) - 12, behavior: 'smooth' })
  }
  useEffect(() => {
    if (!titleEl) { setTitlePast(false); return }
    const h = headerRef.current?.offsetHeight ?? 0
    const io = new IntersectionObserver(([e]) => setTitlePast(!e.isIntersecting && e.boundingClientRect.top < h), { rootMargin: `-${h}px 0px 0px 0px` })
    io.observe(titleEl)
    return () => io.disconnect()
  }, [titleEl])
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
        p_org_slug: orgSlug, p_form_slug: formSlug, p_answers: Object.fromEntries(visible.filter((f) => f.type !== 'info' && f.type !== 'file').map((f) => [f.key, cleanAnswer(answers[f.key])])),
        p_consent: consent, p_hp: honeypot, p_upload_token: token.current, p_files: files.filter((x) => visible.some((f) => f.key === x.field_key)),
      })
      if (error) throw error
      return (data as { message: string }).message
    },
    onSuccess: (m) => { try { sessionStorage.removeItem(draftKey) } catch { /* ok */ } setDone(m); window.scrollTo({ top: 0 }) },
    onError: (e) => { setError(friendlyError(e, 'Não foi possível enviar. Tente novamente.')); window.scrollTo({ top: 0, behavior: 'smooth' }) },
  })

  const org = form.data?.organization
  useEffect(() => { if (form.data?.form?.title && form.data.organization?.name) document.title = `${form.data.form.title} · ${form.data.organization.name}` }, [form.data?.form?.title, form.data?.organization?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  const f0 = form.data?.form
  const blankOther = (v: Answers[string]) => (typeof v === 'string' ? v === OTHER || v === OTHER + ' ' : Array.isArray(v) && v.some((x) => x === OTHER))
  const isEmpty = (f: PublicField) => f.required && f.type !== 'info' && (f.type === 'file' ? !files.some((x) => x.field_key === f.key)
    : f.type === 'checkbox' ? answers[f.key] !== true : answers[f.key] === undefined || answers[f.key] === '' || (Array.isArray(answers[f.key]) && (answers[f.key] as string[]).length === 0) || blankOther(answers[f.key]))
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  /** Tudo o que falta na seção bi: perguntas obrigatórias vazias e o aceite (quando a seção o tem). */
  const pendingList = (bi: number): string[] => {
    const blk = blocks[bi]
    if (!blk) return []
    const out = blk.items.filter(isEmpty).map((x) => lower(x.label))
    if (blk.head && isLoginSection(blk.head) && !signedIn) out.push('entrar com a conta Google')
    const hasConsentHere = (blk.head ? hasConsent(blk.head) : false) || (bi === blocks.length - 1 && !hasConsentBlock && Boolean(f0?.privacy_text))
    if (hasConsentHere && f0?.requires_consent && !consent) out.push('concordar com o tratamento dos dados')
    return out
  }
  const missingText = (list: string[]) => `Falta preencher: ${list.join(', ')}.`
  const go = (to: number) => { setStep(to); setError(''); setShowErrors(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  // Faltando algo: os campos ficam vermelhos, a lista acumula tudo o que falta e a página volta ao topo, onde ela aparece.
  const fail = (bi: number) => { if (bi !== stepIdx) setStep(bi); setError(''); setShowErrors(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const next = () => { if (pendingList(stepIdx).length > 0) fail(stepIdx); else go(stepIdx + 1) }
  const finish = () => {
    if (uploading || submit.isPending) return
    for (let i = 0; i < blocks.length; i++) if (pendingList(i).length > 0) return fail(i)
    submit.mutate()
  }
  const liveMissing = showErrors ? pendingList(stepIdx) : []
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

  // Função (não componente): um componente declarado aqui dentro seria recriado a cada renderização e remontaria o formulário inteiro.
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      {preview ? <p role="status" className="mb-3 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-semibold text-secondary-foreground">Pré-visualização: é assim que o formulário aparece para quem se inscreve. Nada é enviado.</p> : <BackButton to="/site" name="a página inicial" />}
      <header ref={headerRef} className="sticky top-0 z-20 -mx-4 mb-4 bg-background/95 px-4 pb-2 pt-2 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.3)] backdrop-blur">
        <HeaderBand frame={f0?.header ?? DEFAULT_FRAME} logo={org ? <OrgLogo name={org.name} logoPath={org.logo_path} className="h-20 w-20 drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]" /> : null} />
        {progress}
        {f0 && (stepIdx > 0 || titlePast) && (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-left">
            <span className="font-display text-sm font-bold">{f0.title}</span>
            <span className="text-xs text-muted-foreground">Campos com * são obrigatórios.</span>
          </p>
        )}
        {(stepIdx > 0 || titlePast) && anchors.length > 1 && (
          <nav aria-label="Blocos desta etapa" className="mt-1.5 flex flex-wrap gap-1">
            {anchors.map((a) => (
              <button key={a.key} type="button" aria-current={activeAnchor === a.key ? 'true' : undefined} onClick={() => goAnchor(a.key)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${activeAnchor === a.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{a.label}</button>
            ))}
          </nav>
        )}
      </header>
      {children}
    </main>
  )

  if (form.isLoading) return shell(<Skeleton className="h-64" />)
  if (form.isError || form.data?.state === 'not_found') return shell(<Card className="p-6 text-center"><h1>Formulário não encontrado</h1><p className="text-muted-foreground">Confira o link com a organização.</p></Card>)
  if (done) return shell(<Card className="space-y-2 p-6 text-center"><h1>Tudo certo!</h1><p className="whitespace-pre-wrap">{done}</p></Card>)
  if (form.data!.state !== 'open') {
    const msg = { not_open: 'As inscrições ainda não abriram.', closed: 'As inscrições estão encerradas.', full: 'As vagas desta inscrição foram preenchidas.' }[form.data!.state as 'not_open' | 'closed' | 'full']
    return shell(<Card className="space-y-2 p-6 text-center"><h1>{f0?.title}</h1><p className="text-muted-foreground">{msg}</p></Card>)
  }

  return shell(
    <>
      <form onSubmit={(e) => { e.preventDefault(); if (isLast) finish(); else next() }} className="space-y-4" noValidate>
        {stepIdx === 0 && (
          <div ref={setTitleEl}><Card className="space-y-1 p-5 text-center">
            <h1>{f0?.title}</h1>
            {f0?.description && <RichText text={f0.description} className="text-muted-foreground" />}
            {f0?.closes_at && <p className="text-xs text-muted-foreground">Inscrições até {formatDate(f0.closes_at.slice(0, 10))}.</p>}
            <p className="text-xs text-muted-foreground">Campos com * são obrigatórios.</p>
          </Card></div>
        )}
        {(error || liveMissing.length > 0) && <Card role="alert" className="border-destructive p-3 text-destructive">{error || missingText(liveMissing)}</Card>}

        {blocks.filter((_, bi) => bi === stepIdx).map((b, bi) => (
          <section key={b.head?.key ?? `b${bi}`} className="space-y-3" aria-label={b.head?.label}>
            {b.head && (
              <div className="space-y-3 border-l-4 border-primary pl-3 pt-2">
                <h2 className="font-display text-2xl font-extrabold">{b.head.label}</h2>
                {b.head.description && <RichText text={b.head.description} />}
              </div>
            )}
            {b.head && isLoginSection(b.head) && (
              <Card className={cn('space-y-3 p-4', showErrors && !signedIn && 'border-destructive ring-1 ring-destructive')}>
                {signedIn ? (
                  <>
                    <p>Você entrou como <strong>{session?.user.user_metadata?.full_name ?? session?.user.email}</strong>{session?.user.user_metadata?.full_name ? <> ({session.user.email})</> : null}.</p>
                    <p className="text-xs text-muted-foreground">O e-mail desta conta será usado na inscrição.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>Trocar de conta</Button>
                  </>
                ) : (
                  <>
                    <p>É preciso entrar com uma conta Google para continuar. O que você já preencheu fica guardado.</p>
                    <Button type="button" className="w-full" onClick={goLogin}>Continuar com Google</Button>
                  </>
                )}
              </Card>
            )}
            {b.items.map((f) => f.type === 'info' ? (
              <div key={f.key} id={`bloco-${f.key}`} className="space-y-2">
                <p className="font-display text-lg font-bold">{f.label}</p>
                {f.description && <Card className="p-4"><RichText text={f.description} /></Card>}
              </div>
            ) : (
              <Card key={f.key} className={cn('space-y-2 p-4', showErrors && isEmpty(f) && 'border-destructive ring-1 ring-destructive')}>
                {f.type !== 'checkbox' && <Label htmlFor={`f-${f.key}`} id={`f-${f.key}-l`} className={cn('font-display text-lg font-bold', showErrors && isEmpty(f) && 'text-destructive')}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>}
                {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                <FieldInput f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} files={files}
                  onFiles={(fn, pick) => handleFiles(f.key, fn, pick)} />
              </Card>
            ))}
            {b.head && hasConsent(b.head) && (
              <Card className={cn('space-y-2 p-4', showErrors && f0?.requires_consent && !consent && 'border-destructive ring-1 ring-destructive')}>
                {f0?.privacy_text && <><h3>Privacidade e proteção de dados</h3><RichText text={f0.privacy_text} className="text-xs text-muted-foreground" /></>}
                {f0?.requires_consent && (
                  <label className="flex items-start gap-3 pt-1">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
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
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
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
    </>
  )
}
