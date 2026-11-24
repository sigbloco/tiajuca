import { Collapsible } from '@/components/shared/Collapsible'
import { PageLink } from '@/components/shared/PageLink'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { TrashGroup } from '@/components/shared/TrashGroup'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveInput } from '@/components/shared/ConfirmField'
import { Badge, Button, Card, Input, Label, Select } from '@/components/ui/primitives'
import { CATEGORY_TYPES } from '@/modules/members/categoryKind'
import { friendlyError } from '@/core/errors'
import { requireFields } from '@/core/required'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from './CatalogEditor'
import { invalidateCatalog, mirrorFunctionToFees, saveCatalogItem, type CatalogItem } from './service'

/**
 * Categorias: tudo é editável. "Isento" garante a isenção de quem tem a função. O valor mensal de cada categoria fica em Financeiro → Valores.
 */
type Kind = 'paid' | 'collab' | 'payer'
const SECTIONS: { kind: Kind; title: string; hint?: string }[] = [
  { kind: 'paid', title: 'Remuneradas', hint: 'Isentas automaticamente.' },
  { kind: 'collab', title: 'Colaborativas' },
  { kind: 'payer', title: 'Contribuintes', hint: 'Têm valor mensal (definido por ciclo em Financeiro → Valores). A cobrança segue sempre a categoria principal.' },
]

export function FunctionsPage() {
  const canEdit = usePermission('structure.manage')
  const orgId = useOrgId()
  const qc = useQueryClient()
  const funcs = useCatalog('artistic_functions')
  const [adding, setAdding] = useState<Kind | null>(null)
  const [opened, setOpened] = useState<Set<Kind>>(new Set()) // os grupos carregam fechados
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
      if (kind === 'payer') await mirrorFunctionToFees(orgId, { fnId: id, created: nm })
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

  // Tipo e naipe da categoria de contribuição (ficam na categoria de Financeiro ligada a esta, pelo id).
  const feeCats = useCatalog('fee_categories')
  const sections = useCatalog('sections')
  const setFee = useMutation({
    mutationFn: async (v: { id: string; fields: { base_key?: string | null; section_id?: string | null } }) => {
      const { error } = await supabase.from('fee_categories').update(v.fields).eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => { refresh(); notifySaved('Categoria atualizada.') },
    onError,
  })

  const row = (f: CatalogItem) => {
    const locked = !!f.is_fixed
    const fee = kindOf(f) === 'payer' ? (feeCats.data ?? []).find((c) => c.function_id === f.id) : undefined
    return (
      <Card key={f.id} className="flex flex-wrap items-center gap-2 p-2">
        {locked ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 pl-2 font-semibold"><Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{f.name}<Badge>Fixa</Badge></span>
        ) : (
          <SaveInput value={f.name} disabled={!canEdit} aria-label={`Nome de ${f.name}`} onSave={(v) => patch.mutateAsync({ f, fields: { name: v } })} />
        )}
        {canEdit && !locked && (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Mover ${f.name} para a lixeira`} title="Mover para a lixeira"
            onClick={async () => { if (await confirmBox(`Mover a categoria “${f.name}” para a lixeira? Você pode restaurar depois.`)) patch.mutate({ f, fields: { is_active: false } }) }}><Trash2 className="h-4 w-4" /></Button>
        )}
        <div className="basis-full"><SaveInput value={f.description ?? ''} allowEmpty disabled={!canEdit} placeholder="Descrição" aria-label={`Descrição de ${f.name}`} onSave={(v) => patch.mutateAsync({ f, fields: { description: v.trim() || null } })} /></div>
        {fee && (
          <div className="grid basis-full grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor={`tp-${f.id}`} className="text-xs">Tipo</Label>
              <Select id={`tp-${f.id}`} value={fee.base_key ?? ''} disabled={!canEdit || setFee.isPending} onChange={(e) => setFee.mutate({ id: fee.id, fields: { base_key: e.target.value || null } })}>
                <option value="">Outro</option>
                {CATEGORY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select></div>
            <div className="space-y-1"><Label htmlFor={`nz-${f.id}`} className="text-xs">Naipe</Label>
              <Select id={`nz-${f.id}`} value={fee.section_id ?? ''} disabled={!canEdit || setFee.isPending} onChange={(e) => setFee.mutate({ id: fee.id, fields: { section_id: e.target.value || null } })}>
                <option value="">Qualquer naipe</option>
                {(sections.data ?? []).filter((s) => s.is_active || s.id === fee.section_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select></div>
            <p className="col-span-2 text-xs text-muted-foreground">Com um naipe, só quem toca nele pode ter esta categoria como principal (o valor da categoria vale para aquele naipe).</p>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Integrantes podem acumular categorias (por exemplo, direção e Regência). O <strong>Isento</strong> e o valor mensal de cada categoria são definidos por ciclo, em <PageLink to="valores">Financeiro → Valores</PageLink>, que acompanha estas categorias.
      </p>
      {SECTIONS.map((s) => {
        const items = all.filter((f) => f.is_active && kindOf(f) === s.kind)
        return (
          <Collapsible key={s.kind} open={opened.has(s.kind)} onToggle={() => toggle(s.kind)} title={s.title} count={items.length}
            right={canEdit && (
              <Button type="button" size="sm" variant="add" aria-label={`Nova categoria em ${s.title}`} aria-expanded={adding === s.kind}
                onClick={() => { const on = adding === s.kind; setAdding(on ? null : s.kind); setName(''); setExempt(false); if (!on) setOpened((cur) => new Set(cur).add(s.kind)) }}><Plus className="h-4 w-4" /> Nova</Button>
            )}>
            {s.hint && <p className="text-sm text-muted-foreground">{s.hint}</p>}
            {canEdit && adding === s.kind && (
              <Card className="flex flex-wrap items-center gap-3 p-3">
                <Input className="min-w-40 flex-1" autoFocus aria-label={`Nova categoria em ${s.title}`} placeholder="Nome da categoria" value={name} onChange={(e) => setName(e.target.value)} />
                <Button disabled={add.isPending} onClick={() => { if (requireFields([['Nome', name.trim()]])) add.mutate(s.kind) }}><Plus className="h-4 w-4" /> Adicionar</Button>
              </Card>
            )}
            <div className="grid gap-1.5">{items.map(row)}</div>
          </Collapsible>
        )
      })}
      {canEdit && (
        <TrashGroup entries={trash.map((f) => ({ id: f.id, name: `${f.name} (${SECTIONS.find((x) => x.kind === kindOf(f))?.title})` }))}
          onRestore={(id) => { const f = all.find((x) => x.id === id); if (f) patch.mutate({ f, fields: { is_active: true } }) }}
          onPurge={(id) => { const f = all.find((x) => x.id === id); if (f) del.mutate(f) }} />
      )}
    </div>
  )
}
