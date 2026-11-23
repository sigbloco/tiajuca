import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { PageLink } from '@/components/shared/PageLink'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { matchesText } from '@/components/shared/FilterBar'
import { Card, Input, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

interface DirectoryRow { member_id: string; name: string }

/**
 * Integrantes para quem não vê cadastros de outras pessoas (integrante comum, D13): só os nomes de quem está ativo no
 * ciclo atual (nome de exibição ou primeiro nome), sem contato nem ficha. O próprio nome leva a Meu perfil.
 */
export function MemberDirectory({ title }: { title: string }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const [search, setSearch] = useState('')
  const list = useQuery({
    queryKey: ['members', orgId, 'directory'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_directory_active', { p_org: orgId })
      if (error) throw error
      return (data ?? []) as DirectoryRow[]
    },
  })
  const rows = (list.data ?? []).filter((r) => matchesText(r.name, search))
  const total = list.data?.length ?? 0

  return (
    <div className="space-y-4">
      <h1>{title}</h1>
      {!list.isLoading && !list.isError && <p className="text-muted-foreground">{total} {total === 1 ? 'integrante ativo' : 'integrantes ativos'} no ciclo atual</p>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" type="search" aria-label="Buscar integrante pelo nome" placeholder="Buscar pelo nome" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {list.isError && <Card className="p-4 text-destructive">{friendlyError(list.error)}</Card>}
      {list.isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      <div className="space-y-2">
        <ProgressiveList
          items={rows}
          resetKey={search}
          render={(r) => (
            <div key={r.member_id} className="rounded-md bg-card px-3 py-2 font-semibold">
              {r.member_id === membership?.member_id ? <PageLink to="perfil">{r.name}</PageLink> : <span className="break-words">{r.name}</span>}
            </div>
          )}
        />
      </div>
      {!list.isLoading && !list.isError && rows.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum integrante encontrado.</Card>}
      <p className="text-sm text-muted-foreground">Seus dados de contato e de participação ficam em <PageLink to="perfil">Meu perfil</PageLink>.</p>
    </div>
  )
}
