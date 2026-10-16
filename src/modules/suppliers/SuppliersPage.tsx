import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, MessageCircle, Pencil, Phone, Plus, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Select, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { PhoneInput, maskPhone } from '@/components/ui/masked-inputs'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { Collapsible } from '@/components/shared/Collapsible'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { listSupplierCategories, listSuppliers, whatsappUrl, type Supplier, type SupplierCategory } from './service'

function SupplierSheet({ sup, categories, defaultCategory, onClose }: {
  sup: Supplier | null; categories: SupplierCategory[]; defaultCategory: string; onClose: () => void
}) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: sup?.name ?? '', category_id: sup?.category_id ?? defaultCategory, phone: sup?.phone ? maskPhone(sup.phone) : '',
    email: sup?.email ?? '', website: sup?.website ?? '', notes: sup?.notes ?? '',
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['suppliers', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      let site = f.website.trim()
      if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`
      const row = {
        name: f.name.trim(), category_id: f.category_id, phone: f.phone.replace(/\D/g, '') || null,
        email: f.email.trim() || null, website: site || null, notes: f.notes.trim() || null,
      }
      if (sup) {
        const { error } = await supabase.from('suppliers').update(row).eq('id', sup.id)
        if (error) throw error
        return sup.id
      }
      const { data, error } = await supabase.from('suppliers').insert({ ...row, organization_id: orgId }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => {
      const before = sup ? { name: sup.name, category_id: sup.category_id, phone: sup.phone, email: sup.email, website: sup.website, notes: sup.notes } : null
      refresh(); onClose()
      notifyChange(sup ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.', async () => {
        const { error } = await supabase.from('suppliers').update(before ?? { is_active: false }).eq('id', id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('suppliers').update({ is_active: !sup!.is_active }).eq('id', sup!.id)
      if (error) throw error
    },
    onSuccess: () => {
      const was = sup!.is_active
      refresh(); onClose()
      notifyChange(was ? 'Fornecedor desativado.' : 'Fornecedor reativado.', async () => {
        const { error } = await supabase.from('suppliers').update({ is_active: was }).eq('id', sup!.id)
        if (error) throw error
        refresh()
      })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title={sup ? 'Editar fornecedor' : 'Novo fornecedor'} description="Contato de quem presta serviço ao bloco.">
      <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.category_id) save.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="sp-name">Nome (pessoa ou empresa)</Label>
          <Input id="sp-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sp-cat">Categoria</Label>
          <Select id="sp-cat" required value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="" disabled>Escolha…</option>
            {categories.filter((c) => c.is_active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></div>
        <div className="space-y-1.5"><Label htmlFor="sp-phone">Telefone</Label><PhoneInput id="sp-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sp-email">E-mail</Label>
          <Input id="sp-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sp-site">Site ou rede social</Label>
          <Input id="sp-site" placeholder="https://" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sp-notes">Observações</Label>
          <Input id="sp-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <Button type="submit" className="w-full" disabled={!f.name.trim() || !f.category_id || save.isPending}>Salvar</Button>
        {sup && (
          <Button type="button" variant="ghost" className={sup.is_active ? 'w-full text-destructive' : 'w-full'} onClick={() => {
            if (!sup.is_active || window.confirm('Desativar este fornecedor? Ele some da lista, mas o cadastro é mantido.')) toggle.mutate()
          }}>{sup.is_active ? 'Desativar fornecedor' : 'Reativar fornecedor'}</Button>
        )}
      </form>
    </SheetContent>
  )
}

function CategoriesSheet({ categories, onClose }: { categories: SupplierCategory[]; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['suppliers', orgId] })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('supplier_categories').insert({ organization_id: orgId, name: name.trim(), sort_order: categories.length + 1 })
      if (error) throw error
    },
    onSuccess: () => { setName(''); toast.success('Categoria criada.'); refresh() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const patch = useMutation({
    mutationFn: async ({ id, ...p }: { id: string; name?: string; is_active?: boolean }) => {
      const { error } = await supabase.from('supplier_categories').update(p).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Categorias de fornecedores" description="Ex.: Sonorização, Tenda, Fotógrafo.">
      <div className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate() }} className="flex gap-2">
          <Input aria-label="Nova categoria" placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || add.isPending}>Adicionar</Button>
        </form>
        <ul className="space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <Input aria-label={`Nome da categoria ${c.name}`} defaultValue={c.name} disabled={!c.is_active}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) patch.mutate({ id: c.id, name: v }) }} />
              <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: c.id, is_active: !c.is_active })}>{c.is_active ? 'Desativar' : 'Reativar'}</Button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="w-full" onClick={onClose}>Fechar</Button>
      </div>
    </SheetContent>
  )
}

function SupplierRow({ s, canManage, onEdit }: { s: Supplier; canManage: boolean; onEdit: () => void }) {
  const wa = whatsappUrl(s.phone)
  return (
    <Card className={`p-3 ${s.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{s.name} {!s.is_active && <Badge>Inativo</Badge>}</p>
          {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
        </div>
        {canManage && <Button size="icon" variant="ghost" aria-label={`Editar ${s.name}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {s.phone && <a className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted" href={`tel:+55${s.phone.replace(/\D/g, '')}`}><Phone className="h-4 w-4" /> {maskPhone(s.phone)}</a>}
        {wa && <a className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
        {s.website && <a className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted" href={s.website} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Site</a>}
        {s.email && <a className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted" href={`mailto:${s.email}`}>{s.email}</a>}
      </div>
    </Card>
  )
}

/** Fornecedores agrupados por categoria (grupos fechados por padrão), com busca em formato de funil. */
export function SuppliersPage() {
  const orgId = useOrgId()
  const canManage = usePermission('suppliers.manage')
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sheet, setSheet] = useState<{ sup: Supplier | null; category: string } | null>(null)
  const [catSheet, setCatSheet] = useState(false)
  const cats = useQuery({ queryKey: ['suppliers', orgId, 'categories'], queryFn: () => listSupplierCategories(orgId) })
  const sups = useQuery({ queryKey: ['suppliers', orgId, 'list'], queryFn: () => listSuppliers(orgId) })

  const groups = useMemo(() => {
    const searching = filter.search.trim() !== ''
    return (cats.data ?? []).map((c) => ({
      cat: c,
      items: (sups.data ?? []).filter((s) => s.category_id === c.id && matchesStatus(s.is_active, filter.status === 'all' ? 'active' : filter.status)
        && matchesText(`${s.name} ${s.notes ?? ''} ${s.phone ?? ''} ${c.name}`, filter.search)),
      searching,
    })).filter((g) => g.items.length > 0 || (!g.searching && filter.status === 'all' && g.cat.is_active))
  }, [cats.data, sups.data, filter])

  const loading = cats.isLoading || sups.isLoading
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>Fornecedores</h1>
        <div className="flex gap-2">
          <FilterBar value={filter} onChange={setFilter} />
          {canManage && <Button variant="outline" onClick={() => setCatSheet(true)}><Tags className="h-4 w-4" /> Categorias</Button>}
          {canManage && <Button onClick={() => setSheet({ sup: null, category: '' })} disabled={!(cats.data ?? []).some((c) => c.is_active)}><Plus className="h-4 w-4" /> Novo</Button>}
        </div>
      </div>
      {loading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {!loading && (cats.data ?? []).length === 0 && <EmptyState>Nenhuma categoria ainda.{canManage ? ' Crie categorias (ex.: Sonorização) e depois cadastre os fornecedores.' : ''}</EmptyState>}
      {groups.map(({ cat, items }) => (
        <Collapsible key={cat.id} title={cat.name} count={items.length}
          open={filter.search.trim() ? true : !!open[cat.id]} onToggle={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
          right={canManage ? <Button size="sm" variant="ghost" onClick={() => setSheet({ sup: null, category: cat.id })}><Plus className="h-4 w-4" /></Button> : undefined}>
          {items.length === 0 && <p className="text-muted-foreground">Nenhum fornecedor nesta categoria.</p>}
          <ProgressiveList items={items} resetKey={filter.search} render={(s) => <SupplierRow key={s.id} s={s} canManage={canManage} onEdit={() => setSheet({ sup: s, category: s.category_id })} />} />
        </Collapsible>
      ))}
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && <SupplierSheet key={sheet.sup?.id ?? `new-${sheet.category}`} sup={sheet.sup} categories={cats.data ?? []} defaultCategory={sheet.category} onClose={() => setSheet(null)} />}
      </Sheet>
      <Sheet open={catSheet} onOpenChange={setCatSheet}>
        {catSheet && <CategoriesSheet categories={cats.data ?? []} onClose={() => setCatSheet(false)} />}
      </Sheet>
    </div>
  )
}
