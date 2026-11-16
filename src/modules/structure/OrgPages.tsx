import { Collapsible } from '@/components/shared/Collapsible'
import { PageLink } from '@/components/shared/PageLink'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveInput } from '@/components/shared/ConfirmField'
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
 * Categorias: tudo é editável. "Isento" garante a isenção de quem tem a função. O valor mensal de cada categoria fica em Financeiro → Valores.
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
  const [opened, setOpened] = useState<Set<Kind>>(new Set()) // os grupos carregam fechados
  const [trashOpen, setTrashOpen] = useState(false)
  const toggle = (k: Kind) => setOpened((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const [name, setName] = useState('')
  const [exempt, setExempt] = useState(false)
  const all = (funcs.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const kindOf = (f: CatalogItem): Kind => f.kind ?? 'collab'
  const trash = all.filter((f) => !f.is_active && !f.is_fixed)
  const refresh = () => { invalidateCatalog(qc, orgId); qc.invalidateQueries({ queryKey: ['catalog', orgId, 'fee_categories'] }) }
  const onError = (e: unknown) => toast.error(friendlyError(e))

  const add = useMutation({
    mutationFn: async (kind: Kind) => {
      const nm = name.trim()
      const id = await saveCatalogItem('artistic_functions', orgId, { name: nm, kind, sort_order: (all.reduce((m, f) => Math.max(m, f.sort_order === 99 ? 10 : f.sort_order), 0)) + 1, is_exempt: kind === 'paid' || exempt, ...(kind === 'paid' ? { exempt_locked: true } : {}) })
      await mirrorFunctionToFees(orgId, { fnId: id, created: nm })
      return id
    },
    onSuccess: () => { setName(''); setExempt(false); setAdding(null); refresh(); notifySaved('Categoria criada.') },
    onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { f: CatalogItem; fields: Partial<CatalogItem> & { name?: string } }) => {
      await saveCatalogItem('artistic_functions', orgId, { id: v.f.id, name: v.fields.name ?? v.f.name, ...v.fields })
      if (v.fields.name && v.fields.name !== v.f.name) await mirrorFunctionToFees(orgId, { fnId: v.f.id, renamed: { from: v.f.name, to: v.fields.name } })
      if (v.fields.is_active !== undefined) await mirrorFunctionToFees(orgId, { fnId: v.f.id, active: { name: v.fields.name ?? v.f.name, value: v.fields.is_active } })
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
        <div className="basis-full"><SaveInput value={f.description ?? ''} allowEmpty disabled={!canEdit} placeholder="Descrição (opcional)" aria-label={`Descrição de ${f.name}`} onSave={(v) => patch.mutateAsync({ f, fields: { description: v.trim() || null } })} /></div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Integrantes podem acumular categorias (por exemplo, direção e Regência). Nas colaborativas e artísticas, marque <strong>Isento</strong> para garantir a isenção de quem a tem.
        O valor mensal de cada categoria, por ciclo, fica em <PageLink to="valores">Financeiro → Valores</PageLink>, que acompanha estas categorias.
      </p>
      {SECTIONS.map((s) => {
        const items = all.filter((f) => f.is_active && kindOf(f) === s.kind)
        return (
          <Collapsible key={s.kind} open={opened.has(s.kind)} onToggle={() => toggle(s.kind)} title={s.title} count={items.length}
            right={canEdit && (
              <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted" aria-label={`Adicionar em ${s.title}`} title={`Adicionar em ${s.title}`}
                onClick={() => { const on = adding === s.kind; setAdding(on ? null : s.kind); setName(''); setExempt(false); if (!on) setOpened((cur) => new Set(cur).add(s.kind)) }}><Plus className="h-4 w-4" /></button>
            )}>
            {s.hint && <p className="text-sm text-muted-foreground">{s.hint}</p>}
            {canEdit && adding === s.kind && (
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <Input className="min-w-40 flex-1" autoFocus aria-label={`Nova categoria em ${s.title}`} placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} />
                {s.kind !== 'paid' && <label className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={exempt} onChange={(e) => setExempt(e.target.checked)} /> Isento</label>}
                <Button disabled={add.isPending} onClick={() => { if (requireFields([['Nome', name.trim()]])) add.mutate(s.kind) }}><Plus className="h-4 w-4" /> Adicionar</Button>
              </Card>
            )}
            <div className="grid gap-1.5">{items.map(row)}</div>
          </Collapsible>
        )
      })}
      {canEdit && (
        <Collapsible open={trashOpen} onToggle={() => setTrashOpen((o) => !o)} tone="muted" title="Lixeira" count={trash.length}>
          {trash.length === 0 && <p className="text-sm text-muted-foreground">A lixeira está vazia.</p>}
          <div className="grid gap-1.5">
            {trash.map((f) => (
              <Card key={f.id} className="flex items-center gap-2 p-2">
                <span className="min-w-0 flex-1 break-words pl-2 font-semibold">{f.name} <span className="font-normal text-muted-foreground">({SECTIONS.find((x) => x.kind === kindOf(f))?.title})</span></span>
                <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Restaurar ${f.name}`} title="Restaurar" onClick={() => patch.mutate({ f, fields: { is_active: true } })}><RotateCcw className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${f.name} de vez`} title="Excluir de vez" onClick={async () => { if (await confirmBox(`Excluir “${f.name}” de vez? Isso não pode ser desfeito.`)) del.mutate(f) }}><Trash2 className="h-4 w-4" /></Button>
              </Card>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  )
}
