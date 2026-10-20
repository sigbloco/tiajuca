import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, FileText, Folder } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, Input, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { driveInvoke, type DriveFile, type DriveList } from './drive'

/** Navega pela pasta institucional do Drive e devolve o arquivo escolhido (a gravação do anexo é feita pelo pai). */
export function DrivePicker({ onPick, onPickFolder }: { onPick?: (f: DriveFile) => void; /** Modo pasta: mostra só pastas e devolve a escolhida (nome e link). */ onPickFolder?: (f: { id: string; name: string; url: string }) => void }) {
  const orgId = useOrgId()
  const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Pasta de partituras' }])
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(q), 350); return () => clearTimeout(t) }, [q])
  const current = stack[stack.length - 1]
  const folderMode = !!onPickFolder
  const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`

  const list = useQuery({
    queryKey: ['drive-list', orgId, current.id, term],
    retry: false,
    queryFn: () => driveInvoke<DriveList>(orgId, { action: 'list', q: term, folder_id: current.id }),
  })

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        {stack.length > 1 && <Button type="button" size="icon" variant="ghost" aria-label="Voltar" onClick={() => setStack(stack.slice(0, -1))}><ChevronLeft className="h-4 w-4" /></Button>}
        <p className="min-w-0 flex-1 truncate font-semibold">{stack.map((s) => s.name).join(' / ')}</p>
      </div>
      <Input placeholder="Buscar nesta pasta pelo nome" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault() }} />
      {folderMode && list.data && (
        <Button type="button" size="sm" onClick={() => onPickFolder!({ id: current.id ?? list.data!.folder_id, name: current.name, url: folderUrl(current.id ?? list.data!.folder_id) })}>Usar esta pasta</Button>
      )}
      {list.isLoading && <Skeleton className="h-20" />}
      {list.isError && <p className="text-destructive">{friendlyError(list.error, 'Não foi possível consultar o Google Drive.')}</p>}
      {list.data?.files.length === 0 && <p className="text-muted-foreground">Nada encontrado.</p>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {list.data?.files.filter((f) => !folderMode || f.is_folder).map((f) => (
          <div key={f.id} className="flex items-center gap-1">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-left hover:bg-muted"
              onClick={() => (f.is_folder ? (setStack([...stack, { id: f.id, name: f.name }]), setQ('')) : onPick?.(f))}>
              {f.is_folder ? <Folder className="h-5 w-5 shrink-0 text-warning" /> : <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{f.name}</span>
            </button>
            {folderMode && f.is_folder && <Button type="button" size="sm" variant="outline" onClick={() => onPickFolder!({ id: f.id, name: f.name, url: folderUrl(f.id) })}>Escolher</Button>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{folderMode ? 'Entre nas pastas e use “Escolher”. ' : ''}Ao escolher, só o link é guardado. Quem abrir precisa ter acesso à pasta no Drive.</p>
    </Card>
  )
}
