import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { SUB_STATUS_CLASS, SUB_STATUS_LABEL, type FormRow, type SubmissionRow } from './service'
import { MAPPING_LABEL, type FieldOption } from './types'

const PAGE = 20
interface SnapField { key: string; label: string; type: string; options: FieldOption[]; mapping: string | null }
interface Version { id: string; version: number; snapshot: { fields: SnapField[] } }
interface FileRow { id: string; field_key: string; storage_path: string; file_name: string }
const SENSITIVE = (m: string | null) => Boolean(m && m.startsWith('sensitive.'))
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

function show(f: SnapField, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.map((x) => f.options.find((o) => o.value === x)?.label ?? String(x)).join(', ')
  if (f.type === 'yes_no') return v === 'yes' ? 'Sim' : 'Não'
  if (f.type === 'checkbox') return v ? 'Sim' : 'Não'
  if (f.type === 'date' && typeof v === 'string') return v.split('-').reverse().join('/')
  if (f.options.length) return f.options.find((o) => o.value === v)?.label ?? String(v)
  return String(v)
}

function SubmissionSheet({ sub, version, form, onClose }: { sub: SubmissionRow; version: Version | undefined; form: FormRow; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [notes, setNotes] = useState(sub.reviewer_notes ?? '')
  const [cycleStatus, setCycleStatus] = useState('')
  const [showSensitive, setShowSensitive] = useState(false)
  const files = useQuery({
    queryKey: ['sub-files', orgId, sub.id],
    queryFn: async () => { const { data, error } = await supabase.from('form_submission_files').select('id, field_key, storage_path, file_name').eq('submission_id', sub.id); if (error) throw error; return (data ?? []) as FileRow[] },
  })
  const done = (m: string) => { toast.success(m); qc.invalidateQueries({ queryKey: ['submissions', orgId] }); onClose() }
  const review = useMutation({
    mutationFn: async (status: string) => { const { error } = await supabase.rpc('review_submission', { p_id: sub.id, p_status: status, p_notes: notes || null }); if (error) throw error },
    onSuccess: (_d, s) => done(s === 'rejected' ? 'Inscrição rejeitada.' : s === 'archived' ? 'Inscrição arquivada.' : 'Inscrição reaberta.'), onError: (e) => toast.error(friendlyError(e)),
  })
  const approve = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('approve_submission', { p_id: sub.id, p_notes: notes || null, p_cycle_status: cycleStatus || null }); if (error) throw error },
    onSuccess: () => done('Aprovada! O integrante foi criado com os dados da inscrição.'), onError: (e) => toast.error(friendlyError(e)),
  })
  const saveNotes = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('save_submission_notes', { p_id: sub.id, p_notes: notes }); if (error) throw error },
    onSuccess: () => { toast.success('Observação salva.'); qc.invalidateQueries({ queryKey: ['submissions', orgId] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const openFile = async (f: FileRow) => {
    const { data, error } = await supabase.storage.from('form-uploads').createSignedUrl(f.storage_path, 600)
    if (error) return toast.error('Não foi possível abrir o arquivo.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const fields = (version?.snapshot.fields ?? []).filter((f) => f.type !== 'info')
  const plain = fields.filter((f) => !SENSITIVE(f.mapping))
  const sensitive = fields.filter((f) => SENSITIVE(f.mapping))
  const purged = Boolean(sub.purged_at)

  return (
    <SheetContent title="Inscrição" description={`${formatDateTime(sub.submitted_at)} · versão ${version?.version ?? '?'} do formulário`}>
      <Badge className={SUB_STATUS_CLASS[sub.status]}>{SUB_STATUS_LABEL[sub.status]}</Badge>
      {purged && <Card className="p-3 text-muted-foreground">Respostas removidas pela política de retenção.</Card>}
      <dl className="space-y-2">
        {plain.map((f) => (<div key={f.key}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="whitespace-pre-wrap font-semibold">{show(f, sub.answers[f.key])}</dd></div>))}
      </dl>
      {sensitive.length > 0 && (
        <Card className="space-y-2 p-3">
          <button className="flex items-center gap-2 font-semibold" onClick={() => setShowSensitive(!showSensitive)}>{showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Dados sensíveis (LGPD)</button>
          {showSensitive && sensitive.map((f) => (<div key={f.key}><p className="text-xs text-muted-foreground">{f.label}</p><p className="font-semibold">{show(f, sub.answers[f.key])}</p></div>))}
        </Card>
      )}
      {(files.data?.length ?? 0) > 0 && (
        <section className="space-y-1"><h3>Arquivos</h3>{files.data!.map((f) => <Button key={f.id} variant="outline" size="sm" className="w-full justify-start" onClick={() => openFile(f)}>{f.file_name}</Button>)}</section>
      )}
      <p className="text-xs text-muted-foreground">Consentimento: {sub.consent_given ? 'concedido' : 'não registrado'}</p>

      <div className="space-y-2">
        <Input placeholder="Observações da análise" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button size="sm" variant="outline" disabled={saveNotes.isPending} onClick={() => saveNotes.mutate()}>Salvar observação</Button>
      </div>

      {sub.status === 'pending' && !purged && (
        <div className="mt-auto space-y-2">
          {form.cycle_id && (
            <Select aria-label="Status no ciclo" value={cycleStatus} onChange={(e) => setCycleStatus(e.target.value)}>
              <option value="">Aprovar sem definir status no ciclo</option><option value="waitlist">Entrar na lista de espera</option><option value="active">Entrar como ativo</option>
            </Select>
          )}
          <Button className="w-full" disabled={approve.isPending} onClick={() => approve.mutate()}>Aprovar e criar integrante</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => review.mutate('rejected')}>Rejeitar</Button>
            <Button variant="ghost" onClick={() => review.mutate('archived')}>Arquivar</Button>
          </div>
        </div>
      )}
      {sub.status !== 'pending' && sub.status !== 'approved' && !purged && <Button variant="outline" onClick={() => review.mutate('pending')}>Reabrir análise</Button>}
      {sub.status === 'approved' && <p className="text-muted-foreground">Integrante criado. Veja em Integrantes.</p>}
    </SheetContent>
  )
}

export function SubmissionsTab({ form }: { form: FormRow }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<SubmissionRow | null>(null)
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0) }, 300); return () => clearTimeout(t) }, [search])
  useEffect(() => setPage(0), [status])

  const versions = useQuery({
    queryKey: ['form-versions', orgId, form.id],
    queryFn: async () => { const { data, error } = await supabase.from('form_versions').select('id, version, snapshot').eq('form_id', form.id).order('version'); if (error) throw error; return (data ?? []) as Version[] },
  })
  const list = useQuery({
    queryKey: ['submissions', orgId, form.id, status, q, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let qy = supabase.from('form_submissions').select('*', { count: 'exact' }).eq('form_id', form.id).order('submitted_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (status) qy = qy.eq('status', status)
      const term = q.replace(/[%*,()]/g, ' ').trim()
      if (term) qy = qy.ilike('applicant_email', `%${term}%`)
      const { data, error, count } = await qy
      if (error) throw error
      return { rows: (data ?? []) as SubmissionRow[], total: count ?? 0 }
    },
  })
  const nameOf = (s: SubmissionRow) => {
    const v = versions.data?.find((x) => x.id === s.form_version_id)
    const k = v?.snapshot.fields.find((f) => f.mapping === 'member.full_name')?.key
    return (k && (s.answers[k] as string)) || s.applicant_email || 'Sem identificação'
  }
  const purge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('purge_old_submissions', { p_org: orgId })
      if (error) throw error
      const paths = (data as string[]) ?? []
      if (paths.length) await supabase.storage.from('form-uploads').remove(paths)
      return paths.length
    },
    onSuccess: () => { toast.success('Política de retenção aplicada.'); qc.invalidateQueries({ queryKey: ['submissions', orgId] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const exportCsv = async () => {
    const { data, error } = await supabase.from('form_submissions').select('*').eq('form_id', form.id).order('submitted_at').limit(2000)
    if (error) return toast.error(friendlyError(error))
    const last = versions.data?.[versions.data.length - 1]
    const cols = (last?.snapshot.fields ?? []).filter((f) => f.type !== 'info' && f.type !== 'file' && !SENSITIVE(f.mapping))
    const rows = ((data ?? []) as SubmissionRow[]).filter((s) => !s.purged_at)
    const lines = [['Data', 'Status', ...cols.map((c) => c.label)], ...rows.map((s) => [formatDateTime(s.submitted_at, membership?.timezone), SUB_STATUS_LABEL[s.status], ...cols.map((c) => show(c, s.answers[c.key]))])]
    const blob = new Blob(['﻿' + lines.map((l) => l.map(csv).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inscricoes-${form.slug}.csv`; a.click(); URL.revokeObjectURL(a.href)
    toast.message('CSV sem dados sensíveis (gênero, cor/raça, deficiência) e sem arquivos.')
  }
  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Respostas</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="ghost" size="sm" disabled={purge.isPending} onClick={() => { if (window.confirm('Remover respostas antigas? Rejeitadas/arquivadas há mais de 12 meses e pendentes há mais de 6 meses. Aprovadas não são afetadas.')) purge.mutate() }}>Aplicar retenção</Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Buscar por e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas as situações</option>{Object.entries(SUB_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      {list.isLoading && <Skeleton className="h-24" />}
      {list.data?.rows.length === 0 && <EmptyState>Nenhuma resposta.</EmptyState>}
      <div className="grid gap-2">
        {list.data?.rows.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-3 p-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(s)}>
              <p className="truncate font-semibold">{s.purged_at ? 'Resposta removida (retenção)' : nameOf(s)}</p>
              <p className="truncate text-muted-foreground">{formatDateTime(s.submitted_at, membership?.timezone)}{s.applicant_email && !s.purged_at ? ` · ${s.applicant_email}` : ''}</p>
            </button>
            <Badge className={SUB_STATUS_CLASS[s.status]}>{SUB_STATUS_LABEL[s.status]}</Badge>
          </Card>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{total} resposta(s)</p>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page + 1} / {pages}</span>
          <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <SubmissionSheet key={selected.id} sub={selected} version={versions.data?.find((v) => v.id === selected.form_version_id)} form={form} onClose={() => setSelected(null)} />}
      </Sheet>
    </div>
  )
}

export { MAPPING_LABEL }
