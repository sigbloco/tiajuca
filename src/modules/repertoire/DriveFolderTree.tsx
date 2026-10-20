import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Folder } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { driveInvoke, type DriveList } from './drive'

export interface PickedFolder { id: string; name: string; url: string }
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`

function useSubfolders(rootId: string, id: string, enabled: boolean) {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['drive-tree', orgId, rootId, id],
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => driveInvoke<DriveList>(orgId, { action: 'list', folder_id: id, root_id: rootId, folders_only: true }),
  })
}

const Loading = ({ depth }: { depth: number }) => <p className="animate-pulse py-1 text-xs text-muted-foreground" style={{ paddingLeft: depth * 16 + 8 }}>Carregando…</p>

/** Um nível da árvore: carrega as subpastas só quando é aberto (uma consulta ao Drive por pasta aberta; o resultado fica guardado por 5 minutos). */
function Node({ id, name, rootId, depth, onPick }: { id: string; name: string; rootId: string; depth: number; onPick: (f: PickedFolder) => void }) {
  const [open, setOpen] = useState(false)
  const kids = useSubfolders(rootId, id, open)
  return (
    <div>
      <div className="flex items-center gap-1 rounded-lg hover:bg-muted" style={{ paddingLeft: depth * 16 }}>
        <button type="button" aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 p-1.5 text-left" onClick={() => setOpen(!open)}>
          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
          <Folder className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="truncate">{name}</span>
          {open && kids.isFetching && <span className="shrink-0 animate-pulse text-xs text-muted-foreground">carregando…</span>}
        </button>
        <Button type="button" size="sm" variant="outline" onClick={() => onPick({ id, name, url: folderUrl(id) })}>Escolher</Button>
      </div>
      {open && (
        <div>
          {kids.isError && <p className="py-1 text-sm text-destructive" style={{ paddingLeft: (depth + 1) * 16 }}>{friendlyError(kids.error, 'Não foi possível consultar o Drive.')}</p>}
          {kids.data && kids.data.files.length === 0 && <p className="py-1 text-sm text-muted-foreground" style={{ paddingLeft: (depth + 1) * 16 }}>Sem subpastas.</p>}
          {kids.data?.files.filter((f) => f.is_folder).map((f) => <Node key={f.id} id={f.id} name={f.name} rootId={rootId} depth={depth + 1} onPick={onPick} />)}
        </div>
      )}
    </div>
  )
}

/** Árvore das subpastas de uma pasta cadastrada (a própria pasta cadastrada não é escolhível: a música sempre fica numa subpasta dela). Aparece já aberta. */
export function DriveRootTree({ rootId, onPick }: { rootId: string; onPick: (f: PickedFolder) => void }) {
  const kids = useSubfolders(rootId, rootId, true)
  return (
    <Card className="max-h-80 space-y-0.5 overflow-y-auto p-2">
      {kids.isLoading && <Loading depth={0} />}
      {kids.isError && <p className="p-2 text-sm text-destructive">{friendlyError(kids.error, 'Não foi possível consultar o Drive.')}</p>}
      {kids.data && kids.data.files.length === 0 && <p className="p-2 text-muted-foreground">Esta pasta não tem subpastas.</p>}
      {kids.data?.files.filter((f) => f.is_folder).map((f) => <Node key={f.id} id={f.id} name={f.name} rootId={rootId} depth={0} onPick={onPick} />)}
      {kids.data && <p className="px-2 pt-1 text-xs text-muted-foreground">Abra as pastas com a setinha e use “Escolher”. Só o link é guardado.</p>}
    </Card>
  )
}
