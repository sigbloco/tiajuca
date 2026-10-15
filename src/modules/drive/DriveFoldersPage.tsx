import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FolderOpen, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Input, Label, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface Folder {
  id: string; name: string; description: string | null; url: string; drive_folder_id: string | null; is_active: boolean; sort_order: number
}
interface Rule { id: string; folder_id: string; access_role_id: string | null; section_id: string | null; instrument_id: string | null }
interface Role { id: string; key: string; name: string; rank: number }

type Target = { kind: 'role' | 'section' | 'instrument'; id: string }
const tkey = (t: Target) => `${t.kind}:${t.id}`

/** "https://drive.google.com/drive/folders/ABC?x" → "ABC". */
function parseFolderId(url: string): string | null {
  return /\/folders\/([\w-]+)/.exec(url)?.[1] ?? /[?&]id=([\w-]+)/.exec(url)?.[1] ?? null
}

function useFolders(orgId: string) {
  return useQuery({
    queryKey: ['drive-folders', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('drive_folders').select('*').eq('organization_id', orgId).order('sort_order').order('name')
      if (error) throw error
      return (data ?? []) as Folder[]
    },
  })
}

function FolderSheet({ folder, rules, roles, onClose }: { folder: Folder | null; rules: Rule[]; roles: Role[]; onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const [f, setF] = useState({ name: folder?.name ?? '', description: folder?.description ?? '', url: folder?.url ?? '' })
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rules.map((r) =>
    r.access_role_id ? tkey({ kind: 'role', id: r.access_role_id }) : r.section_id ? tkey({ kind: 'section', id: r.section_id }) : tkey({ kind: 'instrument', id: r.instrument_id! }))))
  const toggle = (t: Target) => setPicked((p) => { const n = new Set(p); const k = tkey(t); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const urlOk = /^https:\/\/(drive|docs)\.google\.com\//i.test(f.url.trim())

  const save = useMutation({
    mutationFn: async () => {
      const row = { name: f.name.trim(), description: f.description.trim() || null, url: f.url.trim(), drive_folder_id: parseFolderId(f.url.trim()) }
      let id = folder?.id
      if (id) {
        const { error } = await supabase.from('drive_folders').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('drive_folders').insert({ ...row, organization_id: orgId, sort_order: 9999 }).select('id').single()
        if (error) throw error
        id = data.id as string
      }
      // Regras: regrava o conjunto inteiro (configuração, sem histórico a preservar).
      const del = await supabase.from('drive_folder_access').delete().eq('folder_id', id)
      if (del.error) throw del.error
      const rows = [...picked].map((k) => {
        const [kind, tid] = k.split(':')
        return { organization_id: orgId, folder_id: id!, access_role_id: kind === 'role' ? tid : null, section_id: kind === 'section' ? tid : null, instrument_id: kind === 'instrument' ? tid : null }
      })
      if (rows.length) {
        const ins = await supabase.from('drive_folder_access').insert(rows)
        if (ins.error) throw ins.error
      }
    },
    onSuccess: () => { toast.success('Pasta salva.'); qc.invalidateQueries({ queryKey: ['drive-folders', orgId] }); qc.invalidateQueries({ queryKey: ['drive-rules', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('drive_folders').update({ is_active: !folder!.is_active }).eq('id', folder!.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success(folder!.is_active ? 'Pasta desativada.' : 'Pasta reativada.'); qc.invalidateQueries({ queryKey: ['drive-folders', orgId] }); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const chip = (t: Target, label: string) => {
    const on = picked.has(tkey(t))
    return (
      <button key={tkey(t)} type="button" aria-pressed={on} onClick={() => toggle(t)}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}>
        {label}
      </button>
    )
  }
  const secs = (sections.data ?? []).filter((s) => s.is_active)
  const insts = (instruments.data ?? []).filter((i) => i.is_active)

  return (
    <SheetContent title={folder ? 'Editar pasta' : 'Nova pasta do Drive'} description="Defina o link e quem enxerga esta pasta no app.">
      <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && urlOk) save.mutate() }} className="space-y-4">
        <div className="space-y-1.5"><Label htmlFor="df-name">Nome</Label><Input id="df-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="df-url">Link da pasta no Google Drive</Label>
          <Input id="df-url" required placeholder="https://drive.google.com/drive/folders/…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          {f.url && !urlOk && <p className="text-xs text-destructive">Use o link da pasta (drive.google.com ou docs.google.com).</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="df-desc">Descrição</Label><Input id="df-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>

        <div className="space-y-2">
          <p className="font-semibold">Quem vê esta pasta no app</p>
          <p className="text-xs text-muted-foreground">Sem nenhuma marcação, só a Direção vê. Marque papéis, naipes ou instrumentos; a pessoa vê se tiver qualquer um deles.</p>
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Papéis</p>
            <div className="flex flex-wrap gap-2">{roles.filter((r) => r.key !== 'direcao' && r.key !== 'titular').map((r) => chip({ kind: 'role', id: r.id }, r.name))}</div></div>
          <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Naipes</p>
            <div className="flex flex-wrap gap-2">{secs.map((s) => chip({ kind: 'section', id: s.id }, s.name))}</div></div>
          {secs.map((s) => {
            const list = insts.filter((i) => i.section_id === s.id)
            return list.length === 0 ? null : (
              <div key={s.id}><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Instrumentos · {s.name}</p>
                <div className="flex flex-wrap gap-2">{list.map((i) => chip({ kind: 'instrument', id: i.id }, i.name))}</div></div>
            )
          })}
        </div>

        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          O app controla quem vê o <strong>atalho</strong>. Quem abrir a pasta ainda precisa ter acesso no próprio Google Drive: compartilhe a pasta lá com quem deve entrar.
        </p>
        <Button type="submit" className="w-full" disabled={!f.name.trim() || !urlOk || save.isPending}>Salvar</Button>
        {folder && (
          <Button type="button" variant="ghost" className={folder.is_active ? 'w-full text-destructive' : 'w-full'} onClick={() => {
            if (!folder.is_active || window.confirm('Desativar esta pasta? Ela some do app, mas o cadastro é mantido.')) toggleActive.mutate()
          }}>{folder.is_active ? 'Desativar pasta' : 'Reativar pasta'}</Button>
        )}
      </form>
    </SheetContent>
  )
}

/** Pastas do Drive: cada pessoa vê só as liberadas para o seu perfil; a Direção cadastra e define as regras. */
export function DriveFoldersPage() {
  const orgId = useOrgId()
  const canManage = usePermission('drive.manage')
  const folders = useFolders(orgId)
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const [sheet, setSheet] = useState<{ folder: Folder | null } | null>(null)

  const roles = useQuery({
    queryKey: ['access-roles', orgId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from('access_roles').select('id, key, name, rank').eq('organization_id', orgId).order('rank', { ascending: false })
      if (error) throw error
      return (data ?? []) as Role[]
    },
  })
  const rules = useQuery({
    queryKey: ['drive-rules', orgId],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from('drive_folder_access').select('id, folder_id, access_role_id, section_id, instrument_id').eq('organization_id', orgId)
      if (error) throw error
      return (data ?? []) as Rule[]
    },
  })

  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roles.data ?? []) m.set(`role:${r.id}`, r.name)
    for (const s of sections.data ?? []) m.set(`section:${s.id}`, s.name)
    for (const i of instruments.data ?? []) m.set(`instrument:${i.id}`, i.name)
    return m
  }, [roles.data, sections.data, instruments.data])
  const whoSees = (id: string) => (rules.data ?? []).filter((r) => r.folder_id === id).map((r) =>
    names.get(r.access_role_id ? `role:${r.access_role_id}` : r.section_id ? `section:${r.section_id}` : `instrument:${r.instrument_id}`) ?? '…')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1>Pastas do Drive</h1>
        {canManage && <Button onClick={() => setSheet({ folder: null })}><Plus className="h-4 w-4" /> Nova pasta</Button>}
      </div>
      {folders.isLoading && <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {folders.data?.length === 0 && <EmptyState>{canManage ? 'Nenhuma pasta ainda. Cadastre a primeira e escolha quem pode vê-la.' : 'Nenhuma pasta liberada para o seu perfil.'}</EmptyState>}
      <div className="grid gap-3 sm:grid-cols-2">
        {folders.data?.map((f) => {
          const who = canManage ? whoSees(f.id) : []
          return (
            <Card key={f.id} className={`space-y-2 p-4 ${f.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2"><FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="truncate">{f.name}</span></h2>
                {canManage && <Button size="icon" variant="ghost" aria-label={`Editar ${f.name}`} onClick={() => setSheet({ folder: f })}><Pencil className="h-4 w-4" /></Button>}
              </div>
              {f.description && <p className="text-muted-foreground">{f.description}</p>}
              {canManage && (
                <div className="flex flex-wrap gap-1">
                  {!f.is_active && <Badge>Desativada</Badge>}
                  {who.length === 0 ? <Badge className="bg-warning/20">Só a Direção vê</Badge> : who.map((w, i) => <Badge key={i}>{w}</Badge>)}
                </div>
              )}
              <a href={f.url} target="_blank" rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground hover:opacity-90">
                <ExternalLink className="h-4 w-4" /> Abrir no Drive
              </a>
            </Card>
          )
        })}
      </div>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && (
          <FolderSheet key={sheet.folder?.id ?? 'new'} folder={sheet.folder} roles={roles.data ?? []} onClose={() => setSheet(null)}
            rules={sheet.folder ? (rules.data ?? []).filter((r) => r.folder_id === sheet.folder!.id) : []} />
        )}
      </Sheet>
    </div>
  )
}
