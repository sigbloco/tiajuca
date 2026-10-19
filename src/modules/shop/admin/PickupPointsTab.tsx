import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { listPickupPoints, savePickupPoint, type PickupPoint } from './service'

function PickupSheet({ point, onClose }: { point: PickupPoint | null; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: point?.name ?? '', address: point?.address ?? '', opening_hours: point?.opening_hours ?? '', is_active: point?.is_active ?? true })
  const save = useMutation({
    mutationFn: (patch: Partial<typeof f> = {}) => savePickupPoint(orgId, point?.id ?? null, { ...f, ...patch, name: f.name.trim(), address: f.address.trim(), opening_hours: f.opening_hours.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop', orgId, 'pickup'] }); toast.success('Ponto de retirada salvo.'); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={point ? 'Editar ponto de retirada' : 'Novo ponto de retirada'} description="O cliente escolhe um ponto ativo no checkout.">
      <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.address.trim()) save.mutate({}) }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="pp-name">Nome</Label>
          <Input id="pp-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-addr">Endereço</Label>
          <Input id="pp-addr" required value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-hours">Horário de funcionamento</Label>
          <Input id="pp-hours" placeholder="Ex.: Seg a sex, 10h às 18h" value={f.opening_hours} onChange={(e) => setF({ ...f, opening_hours: e.target.value })} /></div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          Disponível no checkout
        </label>
        <Button type="submit" className="w-full" disabled={!f.name.trim() || !f.address.trim() || save.isPending}>Salvar</Button>
      </form>
    </SheetContent>
  )
}

export function PickupPointsTab() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<{ point: PickupPoint | null } | null>(null)
  const q = useQuery({ queryKey: ['shop', orgId, 'pickup'], queryFn: () => listPickupPoints(orgId) })
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Pontos de retirada</h2>
        <Button onClick={() => setSheet({ point: null })}><Plus className="h-4 w-4" /> Novo ponto</Button>
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os pontos de retirada.</EmptyState>}
      {q.data?.length === 0 && <EmptyState>Nenhum ponto de retirada ainda.</EmptyState>}
      {q.data?.map((p) => (
        <Card key={p.id} className={`flex items-start justify-between gap-2 p-3 ${p.is_active ? '' : 'opacity-60'}`}>
          <div className="min-w-0">
            <p className="font-semibold">{p.name} {!p.is_active && <Badge>Inativo</Badge>}</p>
            <p className="text-sm">{p.address}</p>
            <p className="text-sm text-muted-foreground">{p.opening_hours || 'Horário não informado'}</p>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setSheet({ point: p })}><Pencil className="h-4 w-4" /></Button>
        </Card>
      ))}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <PickupSheet key={sheet.point?.id ?? 'new'} point={sheet.point} onClose={() => setSheet(null)} />}
      </Sheet>
    </div>
  )
}
