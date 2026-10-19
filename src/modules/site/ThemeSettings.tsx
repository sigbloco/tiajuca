import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { applyTheme, type OrgTheme } from '@/core/theme'
import { notifySaved } from '@/core/undo'
import { ColorPick } from './ColorPick'
import { textOn } from './links'

/** Cores padrão do bloco (as do sistema todo). Só quem pode gerenciar a organização. O texto sobre cada cor é calculado. */
export function ThemeSettings() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const can = usePermission('org.manage')
  const qc = useQueryClient()
  const saved = { primary: membership?.theme?.primary ?? '#E93D2B', secondary: membership?.theme?.secondary ?? '#DEE33B' }
  const [c, setC] = useState(saved)
  useEffect(() => { setC(saved) }, [saved.primary, saved.secondary]) // eslint-disable-line react-hooks/exhaustive-deps
  const build = (x: { primary: string; secondary: string }): OrgTheme => ({
    primary: x.primary, secondary: x.secondary, primaryForeground: textOn(x.primary), secondaryForeground: textOn(x.secondary),
  })
  const preview = (next: { primary: string; secondary: string }) => { setC(next); applyTheme(build(next), { cache: false }) }
  const write = async (x: { primary: string; secondary: string }) => {
    const { error } = await supabase.from('organizations').update({ theme: { ...build(x), palette: membership?.theme?.palette } }).eq('id', orgId)
    if (error) throw error
    applyTheme(build(x))
    qc.invalidateQueries({ queryKey: ['memberships'] }); qc.invalidateQueries({ queryKey: ['public-org'] }); qc.invalidateQueries({ queryKey: ['public-site'] })
  }
  const save = useMutation({
    mutationFn: () => write(c),
    onSuccess: () => { const before = saved; notifySaved('Cores do bloco salvas.', async () => { await write(before); setC(before) }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!can) return null
  const dirty = c.primary.toLowerCase() !== saved.primary.toLowerCase() || c.secondary.toLowerCase() !== saved.secondary.toLowerCase()
  return (
    <Card className="space-y-3 p-4">
      <h3>Cores do bloco</h3>
      <p className="text-xs text-muted-foreground">Valem para o sistema inteiro: botões, menu, loja, inscrições e a página inicial. O texto sobre cada cor muda sozinho para ficar legível.</p>
      <ColorPick label="Cor principal" value={c.primary} onChange={(v) => v && preview({ ...c, primary: v })} hideDefault />
      <ColorPick label="Cor de destaque" value={c.secondary} onChange={(v) => v && preview({ ...c, secondary: v })} hideDefault />
      <div className="flex gap-2 text-sm font-bold">
        <span className="rounded-lg px-3 py-2" style={{ background: c.primary, color: textOn(c.primary) }}>Principal</span>
        <span className="rounded-lg px-3 py-2" style={{ background: c.secondary, color: textOn(c.secondary) }}>Destaque</span>
      </div>
      <div className="flex gap-2">
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar cores'}</Button>
        {dirty && <Button variant="ghost" onClick={() => preview(saved)}>Descartar</Button>}
      </div>
    </Card>
  )
}
