import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Folder } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { driveInvoke, type DriveList } from './drive'

export interface PickedFolder { id: string; name: string; url: string }
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`

/** Um nível da árvore: carrega as subpastas só quando é aberto (uma consulta ao Drive por pasta aberta; o resultado fica guardado por 5 minutos). */
function Node({ id, name, rootId, depth, onPick }: { id: string; name: string; rootId: string; depth: number; onPick: (f: PickedFolder) => void }) {
  const orgId = useOrgId()
  const [open, setOpen] = useState(false)
  const kids = useQuery({
    queryKey: ['drive-tree', orgId, rootId, id],
    enabled: open,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => driveInvoke<DriveList>(orgId, { action: 'list', folder_id: id, root_id: rootId, folders_only: true }),
  })
  return (
    <div>
      <div className="flex items-center gap-1 rounded-lg hover:bg-muted" style={{ paddingLeft: depth * 16 }}>
        <button type="button" aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-1.5 p-1.5 text-left" onClick={() => setOpen(!open)}>
          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
          <Folder className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="truncate">{name}</span>
        </button>
        <Button type="button" size="sm" variant="outline" onClick={() => onPick({ id, name, url: folderUrl(id) })}>Escolher</Button>
      </div>
      {open && (
        <div>
          {kids.isLoading && <div style={{ paddingLeft: (depth + 1) * 16 }}><Skeleton className="my-1 h-6 w-40" /></div>}
          {kids.isError && <p className="py-1 text-sm text-destructive" style={{ paddingLeft: (depth + 1) * 16 }}>{friendlyError(kids.error, 'Não foi possível consultar o Drive.')}</p>}
          {kids.data && kids.data.files.length === 0 && <p className="py-1 text-sm text-muted-foreground" style={{ paddingLeft: (depth + 1) * 16 }}>Sem subpastas.</p>}
          {kids.data?.files.filter((f) => f.is_folder).map((f) => <Node key={f.id} id={f.id} name={f.name} rootId={rootId} depth={depth + 1} onPick={onPick} />)}
        </div>
      )}
    </div>
  )
}

/** Árvore de pastas do Drive: as raízes são as pastas cadastradas em Google Drive (ex.: Partituras) e dá para abrir cada subpasta e escolher uma. */
export function DriveFolderTree({ roots, onPick }: { roots: { id: string; name: string }[]; onPick: (f: PickedFolder) => void }) {
  return (
    <Card className="max-h-80 space-y-0.5 overflow-y-auto p-2">
      {roots.length === 0 && <p className="p-2 text-muted-foreground">Nenhuma pasta cadastrada em Google Drive.</p>}
      {roots.map((r) => <Node key={r.id} id={r.id} name={r.name} rootId={r.id} depth={0} onPick={onPick} />)}
      <p className="px-2 pt-1 text-xs text-muted-foreground">Abra as pastas com a setinha e use “Escolher”. Só o link é guardado; quem abrir precisa ter acesso no Drive.</p>
    </Card>
  )
}
