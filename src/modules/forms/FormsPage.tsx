import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus } from 'lucide-react'
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
      <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="nf-title">Título</Label><Input id="nf-title" required value={title} onChange={(e) => { setTitle(e.target.value); setSlug(slugify(e.target.value)) }} /></div>
        <div className="space-y-1.5"><Label htmlFor="nf-slug">Endereço (final do link)</Label>
          <Input id="nf-slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          <p className="text-xs text-muted-foreground">{membership ? publicUrl(membership.slug, slug || '…') : ''}</p></div>
        <Button type="submit" className="w-full" disabled={!title.trim() || create.isPending}>Criar</Button>
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
  const copy = async (f: FormRow) => {
    try { await navigator.clipboard.writeText(publicUrl(membership!.slug, f.slug)); toast.success('Link copiado.') } catch { toast.error('Não foi possível copiar.') }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>Inscrições</h1>
        <Button onClick={() => setSheet(true)}><Plus className="h-4 w-4" /> Novo formulário</Button>
      </div>
      {isLoading && <Skeleton className="h-24" />}
      {data?.length === 0 && <EmptyState>Nenhum formulário ainda.</EmptyState>}
      <div className="grid gap-2">
        {data?.map((f) => (
          <Card key={f.id} className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <Link to={`/${membership?.slug}/inscricoes/${f.id}`} className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">{f.title}</p>
                <p className="truncate text-muted-foreground">/f/{membership?.slug}/{f.slug}</p>
              </Link>
              <div className="flex flex-col items-end gap-1">
                <Badge className={FORM_STATUS_CLASS[f.status]}>{FORM_STATUS_LABEL[f.status]}</Badge>
                <span className="text-xs text-muted-foreground">{f.form_submissions?.[0]?.count ?? 0} resposta(s)</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild><Link to={`/${membership?.slug}/inscricoes/${f.id}`}>Abrir</Link></Button>
              {f.status === 'published' && <Button size="sm" variant="outline" onClick={() => copy(f)}><Copy className="h-4 w-4" /> Copiar link</Button>}
              <Button size="sm" variant="ghost" disabled={duplicate.isPending} onClick={() => duplicate.mutate(f.id)}>Duplicar</Button>
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>{sheet && <NewFormSheet />}</Sheet>
    </div>
  )
}
