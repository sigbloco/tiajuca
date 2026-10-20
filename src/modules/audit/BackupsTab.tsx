import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

interface BackupRow { id: string; label: string; kind: 'manual' | 'auto' | 'imported'; created_at: string; created_by_name: string | null; size_bytes: number; table_counts: Record<string, number> }
const KIND_LABEL = { manual: 'Manual', auto: 'Automático', imported: 'Carregado de arquivo' } as const
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const TABLE_LABEL: Record<string, string> = {
  members: 'integrantes', monthly_charges: 'mensalidades', cycles: 'ciclos', member_cycles: 'participações', activities: 'eventos', songs: 'músicas',
  shop_orders: 'pedidos da loja', financial_entries: 'lançamentos', forms: 'formulários', form_submissions: 'inscrições',
}

/** Backups: criar, baixar, carregar de arquivo e restaurar. Antes de qualquer "apagar tudo isso" o sistema gera um backup automático. */
export function BackupsTab() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const list = useQuery({
    queryKey: ['backups', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_backups', { p_org: orgId })
      if (error) throw error
      return (data ?? []) as BackupRow[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['backups', orgId] })
  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('create_backup', { p_org: orgId, p_label: label }); if (error) throw error },
    onSuccess: () => { setLabel(''); refresh(); toast.success('Backup criado.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const download = useMutation({
    mutationFn: async (b: BackupRow) => {
      const { data, error } = await supabase.rpc('get_backup_data', { p_backup: b.id })
      if (error) throw error
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${membership?.slug ?? 'bloco'}-${b.created_at.slice(0, 16).replace(/[:T]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const restore = useMutation({
    mutationFn: async (b: BackupRow) => {
      const { data, error } = await supabase.rpc('restore_backup', { p_backup: b.id })
      if (error) throw error
      return data as { changed: Record<string, number> }
    },
    onSuccess: (r) => {
      const n = Object.values(r.changed ?? {}).reduce((s, v) => s + v, 0)
      toast.success(n === 0 ? 'Nada precisou mudar: os dados já estavam iguais ao backup.' : `Restaurado: ${n} registro(s) em ${Object.keys(r.changed).length} tabela(s). Um backup automático do estado anterior foi guardado.`)
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (b: BackupRow) => { const { error } = await supabase.rpc('delete_backup', { p_backup: b.id }); if (error) throw error },
    onSuccess: () => { refresh(); toast.success('Backup excluído.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      let data: unknown
      try { data = JSON.parse(await file.text()) } catch { throw new Error('O arquivo não é um backup válido.') }
      const { error } = await supabase.rpc('import_backup', { p_org: orgId, p_label: file.name.replace(/\.json$/i, ''), p_data: data })
      if (error) throw error
    },
    onSuccess: () => { refresh(); toast.success('Backup carregado. Use “Restaurar” para aplicá-lo.') },
    onError: (e) => toast.error(friendlyError(e, 'Não foi possível carregar o arquivo.')),
  })

  return (
    <div className="space-y-3">
      <Card className="space-y-1 border-warning p-3 text-sm">
        <p className="font-semibold">Como funciona</p>
        <p>O backup é uma cópia dos dados do bloco (integrantes, mensalidades, ciclos, eventos, loja…). Restaurar devolve as linhas do backup ao que eram, inclusive as que foram apagadas; o que foi criado depois não é removido.
          Antes de restaurar, e antes de qualquer “apagar tudo isso”, o sistema guarda um backup automático (os 20 mais recentes).</p>
        <p className="text-muted-foreground">O arquivo baixado contém dados pessoais de integrantes (LGPD): guarde em local seguro e não o compartilhe.</p>
      </Card>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Input className="min-w-48 flex-1" aria-label="Nome do backup" placeholder="Nome do backup (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Criando…' : 'Criar backup agora'}</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Carregar arquivo de backup"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f) }} />
        <Button variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {upload.isPending ? 'Carregando…' : 'Carregar arquivo'}</Button>
      </Card>

      {list.isLoading && <Skeleton className="h-24" />}
      {list.isError && <Card className="p-4 text-destructive">{friendlyError(list.error)}</Card>}
      {list.data?.length === 0 && <EmptyState>Nenhum backup ainda.</EmptyState>}
      <div className="grid gap-2">
        {list.data?.map((b) => (
          <Card key={b.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{b.label} <Badge>{KIND_LABEL[b.kind]}</Badge></p>
                <p className="text-sm text-muted-foreground">{formatDateTime(b.created_at)}{b.created_by_name ? ` · ${b.created_by_name}` : ''} · {size(b.size_bytes)}</p>
                <p className="text-sm text-muted-foreground">{Object.entries(TABLE_LABEL).filter(([k]) => b.table_counts?.[k]).map(([k, label]) => `${b.table_counts[k]} ${label}`).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" disabled={download.isPending} onClick={() => download.mutate(b)}><Download className="h-4 w-4" /> Baixar</Button>
                <Button size="sm" variant="outline" disabled={restore.isPending}
                  onClick={() => { if (window.confirm(`Restaurar “${b.label}”?\n\nOs dados voltam ao que eram neste backup (linhas apagadas ou alteradas depois são recuperadas). Um backup automático do estado atual é guardado antes.`)) restore.mutate(b) }}>
                  <RotateCcw className="h-4 w-4" /> {restore.isPending ? 'Restaurando…' : 'Restaurar'}
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir ${b.label}`} title="Excluir o backup"
                  onClick={() => { if (window.confirm(`Excluir o backup “${b.label}”? Isso não pode ser desfeito.`)) remove.mutate(b) }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
