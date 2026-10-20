import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Music2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Sheet, SheetContent, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { COLOR_DOT, type TypeColor } from '@/modules/events/service'
import { listRepertoires, type Repertoire } from './service'

export function RepertoireSheet({ rep, onClose }: { rep: Repertoire | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: rep?.name ?? '', description: rep?.description ?? '', color: (rep?.color ?? 'primary') as TypeColor })
  const save = useMutation({
    mutationFn: async () => {
      const row = { name: f.name.trim(), description: f.description.trim() || null, color: f.color }
      const q = rep ? supabase.from('repertoires').update(row).eq('id', rep.id)
        : supabase.from('repertoires').insert({ ...row, organization_id: orgId, sort_order: 9999 })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { toast.success(rep ? 'Repertório atualizado.' : 'Repertório criado.'); qc.invalidateQueries({ queryKey: ['repertoires', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('repertoires').update({ is_active: !rep!.is_active }).eq('id', rep!.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success(rep!.is_active ? 'Repertório desativado.' : 'Repertório reativado.'); qc.invalidateQueries({ queryKey: ['repertoires', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={rep ? 'Editar repertório' : 'Novo repertório'} description="Ex.: Carnaval 2027, Junino, Cortejo.">
      <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="rp-name">Nome</Label><Input id="rp-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="rp-desc">Descrição</Label><Input id="rp-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <Button type="submit" className="w-full" disabled={!f.name.trim() || save.isPending}>Salvar</Button>
        {rep && (
          <Button type="button" variant="ghost" className={rep.is_active ? 'w-full text-destructive' : 'w-full'} onClick={() => {
            if (!rep.is_active || window.confirm('Desativar este repertório? As músicas e o histórico são mantidos.')) toggle.mutate()
          }}>{rep.is_active ? 'Desativar repertório' : 'Reativar repertório'}</Button>
        )}
      </form>
    </SheetContent>
  )
}

/** Início do módulo: repertórios em cards (nome, cor e quantidade de músicas). */
export function RepertoirePage() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('repertoire.manage')
  const [sheet, setSheet] = useState<{ rep: Repertoire | null } | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['repertoires', orgId], queryFn: () => listRepertoires(orgId) })

  // Reordena renumerando toda a lista (evita empates de ordem).
  const swap = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const arr = [...(data ?? [])]
      ;[arr[from], arr[to]] = [arr[to], arr[from]]
      const results = await Promise.all(
        arr.map((r, idx) => (r.sort_order === idx + 1 ? null : supabase.from('repertoires').update({ sort_order: idx + 1 }).eq('id', r.id))),
      )
      const failed = results.find((r) => r?.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repertoires', orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>Repertório</h1>
        <div className="flex flex-wrap gap-2">
          {canManage && <Button onClick={() => setSheet({ rep: null })}><Plus className="h-4 w-4" /> Novo repertório</Button>}
        </div>
      </div>
      {isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {data?.length === 0 && <EmptyState>Nenhum repertório ainda.{canManage ? ' Crie o primeiro para começar a cadastrar músicas.' : ''}</EmptyState>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((r, i) => (
          <Card key={r.id} className={cn('overflow-hidden', !r.is_active && 'opacity-60')}>
            <div className={cn('h-2', COLOR_DOT[r.color])} />
            <div className="space-y-2 p-4">
              <Link to={`/${membership?.slug}/repertorio/${r.id}`} className="block">
                <h2 className="flex items-center gap-2"><Music2 className="h-5 w-5 shrink-0" /><span className="truncate">{r.name}</span></h2>
                {r.description && <p className="line-clamp-2 text-muted-foreground">{r.description}</p>}
              </Link>
              <div className="flex items-center justify-between">
                <Badge>{r.songs[0]?.count ?? 0} {(r.songs[0]?.count ?? 0) === 1 ? 'música' : 'músicas'}</Badge>
                {canManage && (
                  <div className="flex flex-wrap items-center justify-end">
                    <Button asChild size="sm"><Link to={`/${membership?.slug}/repertorio/${r.id}?nova=1`}><Plus className="h-4 w-4" /> Música</Link></Button>
                    <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => swap.mutate({ from: i, to: i - 1 })}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === data.length - 1} onClick={() => swap.mutate({ from: i, to: i + 1 })}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setSheet({ rep: r })}>Editar</Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <RepertoireSheet key={sheet.rep?.id ?? 'new'} rep={sheet.rep} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
