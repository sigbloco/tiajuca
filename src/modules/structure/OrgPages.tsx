import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ReadMore } from '@/components/shared/ReadMore'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveInput } from '@/components/shared/ConfirmField'
import { TrashDrawer } from '@/components/shared/TrashDrawer'
import { Badge, Button, Card, Input, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { requireFields } from '@/core/required'
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
type Kind = 'paid' | 'collab' | 'artistic'
const SECTIONS: { kind: Kind; title: string; hint?: string }[] = [
  { kind: 'paid', title: 'Remuneradas', hint: 'Isentas automaticamente.' },
  { kind: 'collab', title: 'Colaborativas' },
  { kind: 'artistic', title: 'Artística' },
]

export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const funcs = useCatalog('artistic_functions')
  const [adding, setAdding] = useState<Kind | null>(null)
  const [name, setName] = useState('')
  const [exempt, setExempt] = useState(false)
  const all = (funcs.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const kindOf = (f: CatalogItem): Kind => f.kind ?? 'collab'
  const refresh = () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }) }
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const add = useMutation({
    mutationFn: async (kind: Kind) => {
      const nm = name.trim()
      const id = await saveCatalogItem('artistic_functions', orgId, { name: nm, kind, sort_order: (all.reduce((m, f) => Math.max(m, f.sort_order === 99 ? 10 : f.sort_order), 0)) + 1, is_exempt: kind === 'paid' || exempt, ...(kind === 'paid' ? { exempt_locked: true } : {}) })
      await mirrorFunctionToFees(orgId, { created: nm })
      return id
    },
    onSuccess: () => { setName(''); setExempt(false); setAdding(null); refresh(); notifySaved('Categoria criada.') },
    onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { f: CatalogItem; fields: Partial<CatalogItem> & { name?: string } }) => {
      await saveCatalogItem('artistic_functions', orgId, { id: v.f.id, name: v.fields.name ?? v.f.name, ...v.fields })
      if (v.fields.name && v.fields.name !== v.f.name) await mirrorFunctionToFees(orgId, { renamed: { from: v.f.name, to: v.fields.name } })
      if (v.fields.is_active !== undefined) await mirrorFunctionToFees(orgId, { active: { name: v.fields.name ?? v.f.name, value: v.fields.is_active } })
    },
    onSuccess: () => { refresh(); notifySaved('Categoria atualizada.') },
    onError,
  })
  const del = useMutation({
    mutationFn: async (f: CatalogItem) => {
      const { error } = await supabase.from('artistic_functions').delete().eq('id', f.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { refresh(); notifySaved('Categoria excluída.') },
    onError: (e) => toast.error(/foreign key|violates|23503/i.test(String((e as Error).message ?? e)) ? 'Há pessoas com esta categoria. Deixe-a na lixeira.' : friendlyError(e)),
  })

  const row = (f: CatalogItem) => {
    const locked = !!f.is_fixed
    const paid = kindOf(f) === 'paid'
    const exemptOn = !!f.is_exempt || !!f.exempt_locked
    return (
      <Card key={f.id} className="flex flex-wrap items-center gap-2 p-2">
        {locked ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 pl-2 font-semibold"><Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{f.name}<Badge>Fixa</Badge></span>
        ) : (
          <SaveInput value={f.name} disabled={!canEdit} aria-label={`Nome de ${f.name}`} onSave={(v) => patch.mutateAsync({ f, fields: { name: v } })} />
        )}
        {!paid && (
          <label className={cn('inline-flex min-h-9 items-center gap-2 text-sm font-semibold', f.exempt_locked && 'text-muted-foreground')} title={f.exempt_locked ? 'Isenção fixa' : undefined}>
            <input type="checkbox" className="h-4 w-4" checked={exemptOn} disabled={!canEdit || !!f.exempt_locked || patch.isPending}
              onChange={(e) => patch.mutate({ f, fields: { is_exempt: e.target.checked } })} /> Isento{f.exempt_locked ? ' (fixo)' : ''}
          </label>
        )}
        {canEdit && !locked && (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Mover ${f.name} para a lixeira`} title="Mover para a lixeira"
            onClick={async () => { if (await confirmBox(`Mover a categoria “${f.name}” para a lixeira? Você pode restaurar depois.`)) patch.mutate({ f, fields: { is_active: false } }) }}><Trash2 className="h-4 w-4" /></Button>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Categorias</h2>
        {canEdit && (
          <TrashDrawer entries={all.filter((f) => !f.is_active && !f.is_fixed).map((f) => ({ id: f.id, name: `${f.name} (${SECTIONS.find((s) => s.kind === kindOf(f))?.title})` }))}
            onRestore={(id) => { const f = all.find((x) => x.id === id); if (f) patch.mutate({ f, fields: { is_active: true } }) }}
            onPurge={(id) => { const f = all.find((x) => x.id === id); if (f) del.mutate(f) }} />
        )}
      </div>
      <ReadMore>
        Integrantes podem acumular categorias (por exemplo, Direção e Regência). Nas colaborativas e artísticas, marque <strong>Isento</strong> para garantir a isenção de quem a tem.
        As categorias de Financeiro → Contribuições refletem estas.
      </ReadMore>
      {SECTIONS.map((s) => {
        const items = all.filter((f) => f.is_active && kindOf(f) === s.kind)
        return (
          <section key={s.kind} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3>{s.title}</h3>
              {canEdit && (
                <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card hover:bg-muted" aria-label={`Adicionar em ${s.title}`} title={`Adicionar em ${s.title}`}
                  onClick={() => { setAdding(adding === s.kind ? null : s.kind); setName(''); setExempt(false) }}><Plus className="h-4 w-4" /></button>
              )}
              {s.hint && <span className="text-sm text-muted-foreground">{s.hint}</span>}
            </div>
            {canEdit && adding === s.kind && (
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <Input className="min-w-40 flex-1" autoFocus aria-label={`Nova categoria em ${s.title}`} placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} />
                {s.kind !== 'paid' && <label className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> Isento</label>}
                <Button disabled={add.isPending} onClick={() => { if (requireFields([['Nome', name.trim()]])) add.mutate(s.kind) }}><Plus className="h-4 w-4" /> Adicionar</Button>
              </Card>
            )}
            <div className="grid gap-1.5">{items.map(row)}</div>
          </section>
        )
      })}
    </div>
  )
}
