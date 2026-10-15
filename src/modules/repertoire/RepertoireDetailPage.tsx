import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, MessageCircle, Plus, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EMPTY_FILTER, FilterBar, matchesStatus, matchesText, type FilterValue } from '@/components/shared/FilterBar'
import { Badge, Button, Card, EmptyState, Sheet, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { COLOR_DOT } from '@/modules/events/service'
import { RepertoireSheet } from './RepertoirePage'
import { SongSheet } from './SongSheet'
import { listRepertoires, listSongs, shareText, type Song } from './service'

export function RepertoireDetailPage() {
  const { repertoireId = '' } = useParams()
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const canManage = usePermission('repertoire.manage')
  const [song, setSong] = useState<{ song: Song | null } | null>(null)
  const [editRep, setEditRep] = useState(false)
  const [filter, setFilter] = useState<FilterValue>({ ...EMPTY_FILTER, status: 'active' })

  const reps = useQuery({ queryKey: ['repertoires', orgId], queryFn: () => listRepertoires(orgId) })
  const rep = reps.data?.find((r) => r.id === repertoireId)
  const songs = useQuery({ queryKey: ['songs', orgId, repertoireId], queryFn: () => listSongs(repertoireId) })

  const move = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const arr = [...(songs.data ?? [])]
      ;[arr[from], arr[to]] = [arr[to], arr[from]]
      const results = await Promise.all(arr.map((s, i) => (s.sort_order === i + 1 ? null : supabase.from('songs').update({ sort_order: i + 1 }).eq('id', s.id))))
      const failed = results.find((r) => r?.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['songs', orgId, repertoireId] }),
    onError: (e) => toast.error(friendlyError(e)),
  })

  const text = rep && songs.data ? shareText(rep, songs.data) : ''
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast.success('Repertório copiado. Cole onde quiser.') } catch { toast.error('Não foi possível copiar.') } }
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')

  const visible = (songs.data ?? []).filter((s) => matchesStatus(s.is_active, filter.status) && matchesText(`${s.title} ${s.artist ?? ''}`, filter.search))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`/${membership?.slug}/repertorio`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">{rep && <span className={cn('h-3 w-3 shrink-0 rounded-full', COLOR_DOT[rep.color])} />}<h1 className="truncate">{rep?.name ?? 'Repertório'}</h1></div>
          {rep?.description && <p className="text-muted-foreground">{rep.description}</p>}
        </div>
        {canManage && rep && <Button size="sm" variant="outline" onClick={() => setEditRep(true)}>Editar</Button>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!text} onClick={copy}><Share2 className="h-4 w-4" /> Copiar lista</Button>
        <Button variant="outline" disabled={!text} onClick={whatsapp}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
        {canManage && <Button onClick={() => setSong({ song: null })}><Plus className="h-4 w-4" /> Nova música</Button>}
      </div>

      <FilterBar value={filter} onChange={setFilter} />
      {songs.isLoading && <Skeleton className="h-24" />}
      {songs.data && visible.length === 0 && <EmptyState>{songs.data.length === 0 ? 'Nenhuma música neste repertório.' : 'Nenhuma música encontrada.'}</EmptyState>}
      <div className="grid gap-2">
        {visible.map((s, i) => (
          <Card key={s.id} className={cn('flex items-center gap-2 p-2.5', !s.is_active && 'opacity-60')}>
            <span className="w-7 text-center font-display text-lg font-bold text-muted-foreground">{i + 1}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => setSong({ song: s })}>
              <p className="truncate font-semibold">{s.title}</p>
              <p className="truncate text-muted-foreground">{[s.artist, s.musical_key ? `tom ${s.musical_key}` : null, s.genre].filter(Boolean).join(' · ') || '—'}</p>
            </button>
            {!s.is_active && <Badge>Inativa</Badge>}
            {canManage && filter.status === 'active' && !filter.search && (
              <div className="flex">
                <Button size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move.mutate({ from: songs.data!.indexOf(s), to: songs.data!.indexOf(visible[i - 1]) })}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Descer" disabled={i === visible.length - 1} onClick={() => move.mutate({ from: songs.data!.indexOf(s), to: songs.data!.indexOf(visible[i + 1]) })}><ArrowDown className="h-4 w-4" /></Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Sheet open={song !== null} onOpenChange={(o) => !o && setSong(null)}>
        {song && <SongSheet key={song.song?.id ?? 'new'} repertoireId={repertoireId} song={song.song} onClose={() => setSong(null)} />}
      </Sheet>
      <Sheet open={editRep} onOpenChange={setEditRep}>{editRep && rep && <RepertoireSheet rep={rep} onClose={() => setEditRep(false)} />}</Sheet>
    </div>
  )
}
