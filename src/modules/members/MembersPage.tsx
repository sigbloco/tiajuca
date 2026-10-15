import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Link2, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Label, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { adultBirthDateMax } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { Can } from '@/core/permissions'
import { MemberDetailSheet } from './MemberDetailSheet'
import { createInvite, createMember, listMembers, type MemberRow } from './service'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function NewMemberSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [form, setForm] = useState({ full_name: '', display_name: '', email: '', phone: '', birth_date: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const create = useMutation({
    mutationFn: () => createMember(orgId, form),
    onSuccess: () => {
      toast.success('Integrante cadastrado.')
      qc.invalidateQueries({ queryKey: ['members', orgId] })
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Novo integrante" description="Dados sensíveis são preenchidos depois, na ficha do integrante.">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate() }} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="full_name">Nome completo</Label><Input id="full_name" required value={form.full_name} onChange={set('full_name')} /></div>
        <div className="space-y-1.5"><Label htmlFor="display_name">Como prefere ser chamado</Label><Input id="display_name" value={form.display_name} onChange={set('display_name')} /></div>
        <div className="space-y-1.5"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={form.email} onChange={set('email')} /></div>
        <div className="space-y-1.5"><Label htmlFor="phone">Celular</Label><Input id="phone" type="tel" value={form.phone} onChange={set('phone')} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="birth_date">Data de nascimento</Label>
          <Input id="birth_date" type="date" max={adultBirthDateMax()} value={form.birth_date} onChange={set('birth_date')} />
          <p className="text-xs text-muted-foreground">Apenas maiores de 18 anos podem ser integrantes.</p>
        </div>
        <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? 'Salvando…' : 'Cadastrar'}</Button>
      </form>
    </SheetContent>
  )
}

function InviteButton({ member }: { member: MemberRow }) {
  const invite = useMutation({
    mutationFn: () => createInvite(member.id),
    onSuccess: async (token) => {
      const link = `${window.location.origin}/convite/${token}`
      try {
        await navigator.clipboard.writeText(link)
        toast.success('Link de convite copiado. Válido por 7 dias.')
      } catch {
        toast.message('Link de convite', { description: link })
      }
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (member.user_id) return <Badge className="bg-success/15 text-success">Conta vinculada</Badge>
  return (
    <Button size="sm" variant="outline" disabled={invite.isPending} onClick={() => invite.mutate()}>
      <Link2 className="h-4 w-4" /> Convidar
    </Button>
  )
}

export function MembersPage() {
  const orgId = useOrgId()
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounced(searchInput)
  const [page, setPage] = useState(0)
  const [ascending, setAscending] = useState(true)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<MemberRow | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['members', orgId, { search, page, ascending }],
    placeholderData: keepPreviousData,
    queryFn: () => listMembers({ orgId, search, page, pageSize: PAGE_SIZE, sort: 'full_name', ascending, includeArchived: false }),
  })
  useEffect(() => setPage(0), [search])
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Membros</h1>
        <Can permission="members.manage">
          <Sheet open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo integrante</Button>
            <NewMemberSheet onClose={() => setOpen(false)} />
          </Sheet>
        </Can>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou e-mail" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setAscending(!ascending)}>{ascending ? 'A–Z' : 'Z–A'}</Button>
      </div>

      {isError && <Card className="p-4 text-destructive">{friendlyError(error)}</Card>}

      {/* Cards em todas as larguras: evita tabelas largas no celular. */}
      <div className="grid gap-2">
        {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        {data?.rows.map((m) => (
          <Card key={m.id} className="flex items-center justify-between gap-3 p-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(m)}>
              <p className="truncate font-semibold">{m.display_name ?? m.full_name}</p>
              <p className="truncate text-muted-foreground">{m.display_name ? `${m.full_name} · ` : ''}{m.email ?? 'sem e-mail'}</p>
            </button>
            <Can permission="members.manage"><InviteButton member={m} /></Can>
          </Card>
        ))}
        {data && data.rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            {search ? 'Nenhum integrante encontrado para esta busca.' : 'Ainda não há integrantes cadastrados.'}
          </Card>
        )}
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <MemberDetailSheet member={selected} />}
      </Sheet>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">{total} {total === 1 ? 'integrante' : 'integrantes'}</p>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page + 1} / {pages}</span>
          <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
