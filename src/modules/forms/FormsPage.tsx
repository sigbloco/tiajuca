import { requireFields } from '@/core/required'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, CopyPlus, Plus, Trash2 } from 'lucide-react'
import { SettingsButton } from '@/components/shared/SettingsButton'
import { confirmBox } from '@/components/shared/DialogHost'
import { TrashDrawer } from '@/components/shared/TrashDrawer'
import { notifyChange } from '@/core/undo'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { FORM_STATUS_CLASS, FORM_STATUS_LABEL, publicUrl, slugify, type FormRow } from './service'

function NewFormSheet() {
  const orgId = useOrgId()
  const navigate = useNavigate()
  const { membership } = useOrganization()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('forms').insert({ organization_id: orgId, title: title.trim(), slug: slug || slugify(title) }).select('id').single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => { toast.success('Formulário criado como rascunho.'); navigate(`/${membership?.slug}/inscricoes/${id}`) },
    onError: (e) => toast.error(/23505|duplicate/i.test(JSON.stringify(e)) ? 'Já existe um formulário com este endereço (slug).' : friendlyError(e)),
  })
  return (
    <SheetContent title="Novo formulário" description="Começa como rascunho; só vai ao ar quando você publicar.">
      <form onSubmit={(e) => { e.preventDefault(); if (requireFields([['Título', title.trim()]])) create.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="nf-title" required>Título</Label><Input id="nf-title" required value={title} onChange={(e) => { setTitle(e.target.value); setSlug(slugify(e.target.value)) }} /></div>
        <div className="space-y-1.5"><Label htmlFor="nf-slug">Endereço (final do link)</Label>
          <Input id="nf-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          <p className="text-xs text-muted-foreground">{membership ? publicUrl(membership.slug, slug || '—') : ''}</p></div>
        <Button type="submit" className="w-full" disabled={create.isPending}>Criar</Button>
      </form>
    </SheetContent>
  )
}

export function FormsPage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [sheet, setSheet] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['forms', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('forms').select('*, form_submissions(count)').eq('organization_id', orgId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FormRow[]
    },
  })
  const duplicate = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('duplicate_form', { p_form: id }); if (error) throw error },
    onSuccess: () => { toast.success('Formulário duplicado como rascunho.'); qc.invalidateQueries({ queryKey: ['forms', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  // Apagar = lixeira (status "archived": o link deixa de funcionar e as respostas ficam guardadas). Restaurar volta como rascunho.
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: 'archived' | 'draft'; prev: FormRow['status'] }) => {
      const { error } = await supabase.from('forms').update({ status: v.status }).eq('id', v.id)
      if (error) throw error
      return v
    },
    onSuccess: (v, vars) => {
      qc.invalidateQueries({ queryKey: ['forms', orgId] })
      if (v.status === 'archived') notifyChange('Formulário enviado para a lixeira.', async () => { const { error } = await supabase.from('forms').update({ status: vars.prev }).eq('id', v.id); if (error) throw error; qc.invalidateQueries({ queryKey: ['forms', orgId] }) })
      else toast.success('Formulário restaurado como rascunho.')
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const purge = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('purge_form', { p_form: id }); if (error) throw error },
    onSuccess: () => { toast.success('Formulário excluído de vez.'); qc.invalidateQueries({ queryKey: ['forms', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const copy = async (f: FormRow) => {
    try { await navigator.clipboard.writeText(publicUrl(membership!.slug, f.slug)); toast.success('Link copiado.') } catch { toast.error('Não foi possível copiar.') }
  }
  const live = (data ?? []).filter((f) => f.status !== 'archived')
  const trashed = (data ?? []).filter((f) => f.status === 'archived')
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1>Inscrições</h1>
          <TrashDrawer iconOnly entries={trashed.map((f) => ({ id: f.id, name: f.title, detail: `${f.form_submissions?.[0]?.count ?? 0} resposta(s)` }))}
            onRestore={(id) => setStatus.mutate({ id, status: 'draft', prev: 'draft' })} onPurge={(id) => purge.mutate(id)} />
        </div>
        <div className="flex items-center gap-2">
          <SettingsButton to="configuracoes" />
          <Button variant="add" onClick={() => setSheet(true)}><Plus className="h-4 w-4" /> Novo formulário</Button>
        </div>
      </div>
      {isLoading && <Skeleton className="h-24" />}
      {data && live.length === 0 && <EmptyState>Nenhum formulário ainda.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={live} render={(f) => {
          const url = publicUrl(membership!.slug, f.slug)
          return (
            <Card key={f.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/${membership?.slug}/inscricoes/${f.id}`} className="min-w-0 break-words font-display text-lg font-bold">{f.title}</Link>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`Duplicar ${f.title}`} title="Duplicar" disabled={duplicate.isPending} onClick={() => duplicate.mutate(f.id)}><CopyPlus className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <a href={url} target="_blank" rel="noreferrer noopener" className="min-w-0 break-all text-primary hover:underline">{url}</a>
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Copiar link" title="Copiar link" onClick={() => copy(f)}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={FORM_STATUS_CLASS[f.status]}>{FORM_STATUS_LABEL[f.status]}</Badge>
                  <span className="text-xs text-muted-foreground">{f.form_submissions?.[0]?.count ?? 0} resposta(s)</span>
                </div>
              </div>
              <ButtonRow>
                <Button size="sm" variant="outline" asChild><Link to={`/${membership?.slug}/inscricoes/${f.id}`}>Abrir</Link></Button>
                <Button size="sm" variant="outline" className="text-destructive" disabled={setStatus.isPending}
                  onClick={async () => { if (await confirmBox(`Apagar “${f.title}”? Ele vai para a lixeira, o link deixa de funcionar e as respostas são mantidas.`)) setStatus.mutate({ id: f.id, status: 'archived', prev: f.status }) }}><Trash2 className="h-4 w-4" /> Apagar</Button>
              </ButtonRow>
            </Card>
          )
        }} />
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>{sheet && <NewFormSheet />}</Sheet>
    </div>
  )
}
