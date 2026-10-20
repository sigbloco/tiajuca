import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, CircleCheck, Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveInput } from '@/components/shared/ConfirmField'
import { Badge, Button, Card, Input, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, mirrorFunctionToFees, saveCatalogItem, type CatalogItem } from './service'

export function ChecklistsPage() {
  const canEvents = usePermission('events.manage')
  return <TemplatesSettings canEdit={canEvents} />
}

/**
 * Funções: tudo é editável. "Isento" garante a isenção de quem tem a função. As categorias de Financeiro → Contribuições refletem estas funções.
 */
export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const funcs = useCatalog('artistic_functions')
  const [name, setName] = useState('')
  const [exempt, setExempt] = useState(false)
  const list = (funcs.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'))
  const refresh = () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }) }
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const add = useMutation({
    mutationFn: async () => {
      const id = await saveCatalogItem('artistic_functions', orgId, { name: name.trim(), sort_order: (list.reduce((m, f) => Math.max(m, f.sort_order === 99 ? 10 : f.sort_order), 0)) + 1, is_exempt: exempt })
      await mirrorFunctionToFees(orgId, { created: name.trim() })
      return id
    },
    onSuccess: () => { setName(''); setExempt(false); refresh(); notifySaved('Função criada.') },
    onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { f: CatalogItem; fields: Partial<CatalogItem> & { name?: string } }) => {
      await saveCatalogItem('artistic_functions', orgId, { id: v.f.id, name: v.fields.name ?? v.f.name, ...v.fields })
      if (v.fields.name && v.fields.name !== v.f.name) await mirrorFunctionToFees(orgId, { renamed: { from: v.f.name, to: v.fields.name } })
      if (v.fields.is_active !== undefined) await mirrorFunctionToFees(orgId, { active: { name: v.fields.name ?? v.f.name, value: v.fields.is_active } })
    },
    onSuccess: () => { refresh(); notifySaved('Função atualizada.') },
    onError,
  })
  const del = useMutation({
    mutationFn: async (f: CatalogItem) => {
      const { error } = await supabase.from('artistic_functions').delete().eq('id', f.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { refresh(); notifySaved('Função excluída.') },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e)) ? 'Há pessoas com esta função. Desative em vez de excluir.' : friendlyError(e)),
  })

  return (
    <div className="space-y-3">
      <h2>Funções</h2>
      <p className="text-muted-foreground">
        Integrantes podem acumular funções (por exemplo, Direção e Regência). Marque <strong>Isento</strong> para garantir a isenção de quem tem a função.
        As categorias de Financeiro → Contribuições refletem estas funções.
      </p>
      {canEdit && (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <Input className="min-w-40 flex-1" aria-label="Nova função" placeholder="Nova função" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> Isento</label>
          <Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Button>
        </Card>
      )}
      <div className="grid gap-1.5">
        {list.map((f) => {
          const locked = !!f.is_fixed
          const exemptOn = !!f.is_exempt || !!f.exempt_locked
          return (
            <Card key={f.id} className={cn('flex flex-wrap items-center gap-2 p-2', !f.is_active && 'opacity-60')}>
              {locked ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 pl-2 font-semibold"><Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{f.name}<Badge>Fixa</Badge></span>
              ) : (
                <SaveInput value={f.name} disabled={!canEdit} aria-label={`Nome de ${f.name}`} onSave={(v) => patch.mutateAsync({ f, fields: { name: v } })} />
              )}
              <label className={cn('inline-flex min-h-9 items-center gap-2 text-sm font-semibold', f.exempt_locked && 'text-muted-foreground')} title={f.exempt_locked ? 'Isenção fixa' : undefined}>
                <input type="checkbox" className="h-4 w-4" checked={exemptOn} disabled={!canEdit || !!f.exempt_locked || patch.isPending}
                  onChange={(e) => patch.mutate({ f, fields: { is_exempt: e.target.checked } })} /> Isento{f.exempt_locked ? ' (fixo)' : ''}
              </label>
              {canEdit && !locked && (
                <>
                  <Button size="icon" variant="ghost" className={cn('h-8 w-8', !f.is_active && 'text-success')} aria-label={`${f.is_active ? 'Desativar' : 'Reativar'} ${f.name}`} title={f.is_active ? 'Desativar' : 'Reativar'}
                    onClick={() => patch.mutate({ f, fields: { is_active: !f.is_active } })}>{f.is_active ? <Ban className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}</Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${f.name}`} title="Excluir"
                    onClick={() => { if (window.confirm(`Excluir a função “${f.name}”? Se já foi usada, prefira desativar.`)) del.mutate(f) }}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
