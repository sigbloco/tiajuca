import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DateInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { CYCLE_STATUS_LABEL, useCycleTypes, useCycles, type Cycle } from './service'

function NewCycleSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: types } = useCycleTypes()
  const [form, setForm] = useState({ cycle_type_id: '', name: '', starts_on: '', ends_on: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cycles').insert({ ...form, name: form.name.trim(), organization_id: orgId, status: 'planned' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ciclo criado.')
      qc.invalidateQueries({ queryKey: ['cycles', orgId] })
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Novo ciclo" description="Ex.: Carnaval 2026/2027 ou Junino 2027.">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="type">Tipo</Label>
          <Select id="type" required value={form.cycle_type_id} onChange={set('cycle_type_id')}>
            <option value="">Selecione…</option>
            {types?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="name">Nome</Label><Input id="name" required value={form.name} onChange={set('name')} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="start">Início</Label><DateInput id="start" required value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v })} /></div>
          <div className="space-y-1.5"><Label htmlFor="end">Término</Label><DateInput id="end" required min={form.starts_on || undefined} value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} /></div>
        </div>
        <Button type="submit" className="w-full" disabled={create.isPending}>Criar ciclo</Button>
      </form>
    </SheetContent>
  )
}

export function CyclesPage() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const canManage = usePermission('cycles.manage')
  const { data: cycles, isLoading } = useCycles()
  const { data: types } = useCycleTypes()
  const [open, setOpen] = useState(false)

  const update = useMutation({
    mutationFn: async ({ id, patch, makeCurrent }: { id: string; patch: Partial<Cycle>; makeCurrent?: boolean }) => {
      // Só um ciclo pode ser o atual: desmarca o anterior antes.
      if (makeCurrent) {
        const off = await supabase.from('cycles').update({ is_current: false }).eq('organization_id', orgId).eq('is_current', true)
        if (off.error) throw off.error
      }
      const { error } = await supabase.from('cycles').update(patch).eq('id', id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cycles', orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2>Ciclos</h2>
        {canManage && (
          <Sheet open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo ciclo</Button>
            <NewCycleSheet onClose={() => setOpen(false)} />
          </Sheet>
        )}
      </div>
      {isLoading && <Skeleton className="h-24" />}
      {cycles?.length === 0 && <EmptyState>Nenhum ciclo criado. Crie o primeiro para controlar vagas e participação.</EmptyState>}
      <div className="grid gap-2">
        {cycles?.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-display text-lg font-bold">
                {c.name} {c.is_current && <Badge className="bg-primary text-primary-foreground">Atual</Badge>}
                {!c.is_active && <Badge className="ml-1">Arquivado</Badge>}
              </p>
              <p className="text-muted-foreground">
                {types?.find((t) => t.id === c.cycle_type_id)?.name} · {formatDate(c.starts_on)} a {formatDate(c.ends_on)}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <Select className="w-40" value={c.status} onChange={(e) => update.mutate({ id: c.id, patch: { status: e.target.value as Cycle['status'] } })}>
                  {Object.entries(CYCLE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {!c.is_current && c.is_active && (
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: c.id, patch: { is_current: true }, makeCurrent: true })}>Tornar atual</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: c.id, patch: { is_active: !c.is_active, ...(c.is_active ? { is_current: false } : {}) } })}>
                  {c.is_active ? 'Arquivar' : 'Reativar'}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
