import { fillVars } from '@/core/textVars'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { BackButton } from '@/components/shared/BackButton'
import { DEFAULT_FRAME, HeaderBand } from './HeaderBand'
import { RichText } from '@/components/shared/RichText'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '@/core/auth'
import { Children, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Label, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { supabase } from '@/core/supabase'
import { applyTheme } from '@/core/theme'
import { buildInitial, useMemberPrefill } from './prefill'
import { hasConsent, isLoginSection, isSection, isVisible, type Answers, type PublicField, type PublicFormPayload } from './types'
import { type UploadedFile, OTHER, FieldInput } from './FormFieldInput'

const MAX_BYTES = 5 * 1024 * 1024
const OK_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/** Chips que dividem 100% da largura: numa linha só quando cabem (esticados), senão quebram de forma harmônica (4 → 2+2, 5 → 3+2). */
function ChipRow({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLDivElement>(null)
  const [one, setOne] = useState(true)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const check = () => { if (probe.current) setOne(probe.current.scrollWidth <= el.clientWidth + 0.5) }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  })
  const items = Children.toArray(children)
  return (
    <div ref={box} className="relative">
      {/* Medida: largura natural de todos os chips lado a lado (invisível). */}
      <div ref={probe} aria-hidden="true" {...({ inert: '' } as object)} className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1 [&>*]:whitespace-nowrap">{items}</div>
      {one ? <div className="flex gap-1 [&>*]:flex-1 [&>*]:whitespace-nowrap">{items}</div> : <ButtonRow className="!gap-1">{items}</ButtonRow>}
    </div>
  )
}

const cleanAnswer = (v: Answers[string]): Answers[string] | null => {
  if (v === undefined) return null
  if (typeof v === 'string' && v.trim() === OTHER) return null
  if (Array.isArray(v)) { const k = v.filter((x) => x !== OTHER); return k.length ? k : null }
  return v
}

/** Formulário público de inscrição: sem login, identidade visual do bloco, validação no servidor. */
export function PublicFormPage({ preview, initialAnswers }: { /** Pré-visualização: usa estes dados em vez do servidor e não envia nada. */ preview?: PublicFormPayload; /** Respostas já preenchidas (renovação: o formulário vem com os dados do integrante). */ initialAnswers?: Answers } = {}) {
  const { orgSlug = '', formSlug = '' } = useParams()
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {})
  const { session, signInWithGoogle, signOut } = useAuth()
  const [consent, setConsent] = useState(false)
  const [editing, setEditing] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [honeypot, setHoneypot] = useState('')
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const draftKey = `form-draft:${window.location.pathname}`
  const [done, setDone] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const token = useRef<string | null>(null)
  const orgId = useRef<string | null>(null)

  const live = useQuery({
    queryKey: ['public-form', orgSlug, formSlug, session?.user.id ?? null],
    enabled: !preview,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_form', { p_org_slug: orgSlug, p_form_slug: formSlug })
      if (error) throw error
      const p = data as PublicFormPayload
      // Opção com a vaga preenchida continua escolhível, mas avisa que entra na lista de espera.
      const full = new Set(p.form?.full_options ?? [])
      if (p.form && full.size > 0) p.form.fields = p.form.fields.map((f) => ({ ...f, options: (f.options ?? []).map((o) => (full.has(o.value) ? { ...o, label: `${o.label} (Esgotado - Lista de espera)` } : o)) }))
      if (p.organization?.theme) applyTheme(p.organization.theme, { cache: false })
      return p
    },
  })

  const form = preview ? { data: preview, isLoading: false, isError: false } : live
  const fields = form.data?.form?.fields ?? []
  const viewer = form.data?.viewer ?? null
  const fill = (t: string) => fillVars(t, { ...(form.data?.form?.vars ?? {}), titulo: form.data?.form?.title, prazo: form.data?.form?.closes_at, nome: viewer?.name }, answers)
  // Seções por naipe: "_naipe" é uma resposta virtual (o naipe do integrante que entrou). Seção oculta esconde também as perguntas dela.
  const visAnswers = useMemo<Answers>(() => ({ ...answers, _naipe: viewer?.section_id ?? undefined }), [answers, viewer?.section_id])
  const visible = useMemo(() => {
    const out: PublicField[] = []
    let hide = false
    for (const f of fields) {
      const ok = isVisible(f, visAnswers)
      if (isSection(f)) { hide = !ok; if (ok) out.push(f); continue }
      if (!hide && ok) out.push(f)
    }
    return out
  }, [fields, visAnswers])
  // Formulário interno: já vem preenchido com o que consta do cadastro; o integrante só confere e confirma.
  const prefillQ = useMemberPrefill(!preview && viewer ? viewer.member_id : undefined)
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !prefillQ.data || fields.length === 0) return
    prefilled.current = true
    const init = buildInitial(fields, prefillQ.data)
    setAnswers((a) => ({ ...init, ...a }))
  }, [prefillQ.data, fields])

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
  }, [])
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
    onSuccess: (m) => { try { sessionStorage.removeItem(draftKey) } catch { /* ok */ } setDone(form.data?.form?.show_confirmation === false ? '' : m); window.scrollTo({ top: 0 }) },
    onError: (e) => { setError(friendlyError(e, 'Não foi possível enviar. Tente novamente.')); window.scrollTo({ top: 0, behavior: 'smooth' }) },
  })

  const org = form.data?.organization
  useEffect(() => { if (form.data?.form?.title && form.data.organization?.name) document.title = `${form.data.form.title} · ${form.data.organization.name}` }, [form.data?.form?.title, form.data?.organization?.name])
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pt-8">
      {preview ? <p role="status" className="mb-3 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-semibold text-secondary-foreground">{initialAnswers ? 'Pré-visualização com os dados do integrante já preenchidos: é assim que a renovação aparece para ele. Nada é enviado.' : 'Pré-visualização: é assim que o formulário aparece para quem se inscreve. Nada é enviado.'}</p> : <BackButton to="/site" name="o site" />}
      <header ref={headerRef} className="sticky top-[var(--viewas-h,0px)] z-20 -mx-4 mb-4 bg-background/95 px-4 pb-2 pt-2 shadow-[0_6px_14px_-6px_rgba(0,0,0,0.3)] backdrop-blur">
        <HeaderBand frame={f0?.header ?? DEFAULT_FRAME} logo={org ? <OrgLogo name={org.name} logoPath={org.logo_path} className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]" style={{ width: f0?.header?.logo ?? 80, height: f0?.header?.logo ?? 80 }} /> : null} />
        {progress}
        {f0 && (stepIdx > 0 || titlePast) && (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-left">
            <span className="font-display text-sm font-bold">{f0.title}</span>
            <span className="text-xs text-muted-foreground">Campos com * são obrigatórios.</span>
          </p>
        )}
        {(stepIdx > 0 || titlePast) && anchors.length > 1 && (
          <nav aria-label="Blocos desta etapa" className="mt-1.5"><ChipRow>
            {anchors.map((a) => (
              <button key={a.key} type="button" aria-current={activeAnchor === a.key ? 'true' : undefined} onClick={() => goAnchor(a.key)}
                className={`rounded-full px-2.5 py-0.5 text-center text-xs font-semibold transition-colors ${activeAnchor === a.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{a.label}</button>
            ))}
          </ChipRow></nav>
        )}
      </header>
      {children}
    </main>
  )

  if (form.isLoading) return shell(<Skeleton className="h-64" />)
  if (form.isError || form.data?.state === 'not_found') return shell(<Card className="p-6 text-center"><h1>Formulário não encontrado</h1><p className="text-muted-foreground">Confira o link com a organização.</p></Card>)
  if (form.data!.state === 'login_required') return shell(<Card className="space-y-3 p-6 text-center"><h1>{f0?.title}</h1><p>Este formulário é só para integrantes do bloco. Entre com a conta Google que você usa no sistema.</p><Button type="button" className="w-full" onClick={goLogin}>Continuar com Google</Button></Card>)
  if (form.data!.state === 'not_member') return shell(<Card className="space-y-3 p-6 text-center"><h1>{f0?.title}</h1><p>Não encontramos você entre os integrantes{session?.user.email ? <> (conta <strong>{session.user.email}</strong>)</> : null}. Este formulário é só para quem já faz parte do bloco: entre com a conta Google cadastrada no sistema ou fale com a direção.</p><Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>Trocar de conta</Button></Card>)
  if (form.data!.state === 'already' && !editing) {
    const mine = form.data!.mine
    return shell(<Card className="space-y-3 p-6 text-center"><h1>Você já está inscrito</h1>
      <p className="text-muted-foreground">{mine?.status === 'pending'
        ? <>Recebemos a sua resposta para “{f0?.title}”{mine.edited_at ? <> (editada em {formatDate(mine.edited_at.slice(0, 10))})</> : null} e a direção está avaliando. Dá para corrigir enquanto ela não for aprovada.</>
        : <>A sua inscrição em “{f0?.title}” já foi aprovada. Para mudar algum dado, fale com a direção ou use o seu perfil.</>}</p>
      {mine?.status === 'pending' && <Button type="button" className="w-full" onClick={() => { setAnswers(mine.answers ?? {}); setStep(0); setEditing(true); window.scrollTo({ top: 0 }) }}>Editar minha resposta</Button>}
    </Card>)
  }
  if (done !== null) return shell(<Card className="space-y-2 p-6 text-center"><h1>Tudo certo!</h1>{done && <RichText text={done} />}</Card>)
  if (form.data!.state !== 'open' && !(form.data!.state === 'already' && editing)) {
    const msg = { not_open: 'As inscrições ainda não abriram.', closed: 'As inscrições estão encerradas.', full: 'As vagas desta inscrição foram preenchidas.' }[form.data!.state as 'not_open' | 'closed' | 'full']
    return shell(<Card className="space-y-2 p-6 text-center"><h1>{f0?.title}</h1><p className="text-muted-foreground">{msg}</p></Card>)
  }

  return shell(
    <>
      <form onSubmit={(e) => { e.preventDefault(); if (isLast) finish(); else next() }} className="flex flex-1 flex-col gap-4" noValidate>
        {stepIdx === 0 && (
          <div ref={setTitleEl}><Card className="space-y-1 p-5 text-center">
            <h1>{f0?.title}</h1>
            {f0?.description && <RichText text={fill(f0.description)} className="text-muted-foreground" />}
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
                {b.head.description && <RichText text={fill(b.head.description)} />}
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
                {f.description && <Card className="p-4"><RichText text={fill(f.description)} /></Card>}
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
                {f0?.privacy_text && <><h3>Privacidade e proteção de dados</h3><RichText text={fill(f0.privacy_text)} className="text-xs text-muted-foreground" /></>}
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

        {isLast && f0?.send_text && <Card className="p-4"><RichText text={fill(f0.send_text)} /></Card>}

        {isLast && f0?.privacy_text && !hasConsentBlock && (
          <Card className="space-y-2 p-4">
            <h3>Privacidade e proteção de dados</h3>
            <RichText text={fill(f0.privacy_text)} className="text-xs text-muted-foreground" />
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

        <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex gap-2 bg-background/95 px-4 py-2 shadow-[0_-6px_14px_-6px_rgba(0,0,0,0.3)] backdrop-blur">
          {stepIdx > 0 && <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => go(stepIdx - 1)}><ArrowLeft className="h-4 w-4" /> Voltar</Button>}
          {isLast
            ? <Button type="submit" className="h-10 flex-1" disabled={submit.isPending || uploading}>{submit.isPending ? 'Enviando' : uploading ? 'Enviando arquivo' : 'Enviar inscrição'}</Button>
            : <Button type="submit" className="h-10 flex-1" disabled={uploading}>Próximo <ArrowRight className="h-4 w-4" /></Button>}
        </div>
      </form>
    </>
  )
}
