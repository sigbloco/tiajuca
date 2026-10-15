import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, Input, Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { driveInvoke, getDriveConfig, type DriveStatus } from '@/modules/repertoire/drive'

/** Integrações opcionais. Hoje: pasta institucional do Google Drive para buscar partituras. */
export function IntegrationsSettings() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const cfg = useQuery({ queryKey: ['drive-config', orgId], queryFn: () => getDriveConfig(orgId) })
  const [folder, setFolder] = useState('')
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<DriveStatus | null>(null)
  useEffect(() => { if (cfg.data) { setFolder(cfg.data.folder_id ?? ''); setActive(cfg.data.active) } }, [cfg.data])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_drive_integration', { p_org: orgId, p_folder: folder, p_active: active })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Configuração salva.'); setStatus(null); qc.invalidateQueries({ queryKey: ['drive-config', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const test = useMutation({
    mutationFn: () => driveInvoke<DriveStatus>(orgId, { action: 'status' }),
    onSuccess: setStatus,
    onError: (e) => { setStatus(null); toast.error(friendlyError(e)) },
  })

  return (
    <div className="space-y-3">
      <h2>Integrações</h2>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3>Google Drive (partituras)</h3>
          <Badge className={cfg.data?.active ? 'bg-success/15 text-success' : ''}>{cfg.data?.active ? 'Ativa' : cfg.data?.configured ? 'Desativada' : 'Não configurada'}</Badge>
        </div>
        <p className="text-muted-foreground">Permite buscar PDFs e partituras de uma pasta institucional e anexá-los às músicas. É opcional: sem isso, você ainda pode colar links ou enviar arquivos.</p>
        <div className="space-y-1.5">
          <Label htmlFor="drive-folder">Link ou ID da pasta do Drive</Label>
          <Input id="drive-folder" placeholder="https://drive.google.com/drive/folders/…" value={folder} onChange={(e) => setFolder(e.target.value)} />
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativar busca no Drive</label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!folder.trim() || save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          <Button variant="outline" disabled={!cfg.data?.configured || test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Testando…' : 'Testar conexão'}</Button>
        </div>
        {status && (
          <Card className={status.ok ? 'space-y-1 border-success p-3' : 'space-y-1 border-warning p-3'}>
            <p className="font-semibold">{status.ok ? `Conectado à pasta “${status.folder_name}”.` : status.error}</p>
            {status.service_account && <p className="break-all text-xs text-muted-foreground">Conta de serviço (compartilhe a pasta com este e-mail, como leitor): <span className="font-mono text-foreground">{status.service_account}</span></p>}
          </Card>
        )}
        <p className="text-xs text-muted-foreground">A credencial do Google fica guardada só no servidor (segredo da função), nunca no navegador nem no banco. Veja o passo a passo em docs/GOOGLE_DRIVE.md.</p>
      </Card>
    </div>
  )
}
