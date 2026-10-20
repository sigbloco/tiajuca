import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { OrgLogo } from '@/components/shared/OrgLogo'
import { Button, Card, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { applyTheme, varsForArea } from '@/core/theme'
import { COLOR_SLOTS, areaOverrides, withAreaColors, type ThemeArea, type ThemeColors, type ThemeJson } from '@/core/themeModel'
import { notifySaved } from '@/core/undo'
import { UnsavedGuard } from '@/components/shared/UnsavedGuard'
import { useSearchParams } from 'react-router-dom'
import { ColorPick } from '@/modules/site/ColorPick'

const AREAS: { key: ThemeArea; label: string; intro: string }[] = [
  { key: 'general', label: 'Geral', intro: 'Cores do sistema inteiro. São o ponto de partida do Site e da Loja.' },
  { key: 'site', label: 'Site', intro: 'Só a página inicial pública. Onde estiver “Padrão do bloco”, vale o Geral.' },
  { key: 'shop', label: 'Loja', intro: 'Só a vitrine da loja. Onde estiver “Padrão do bloco”, vale o Geral.' },
]

const EMPTY_THEME: ThemeJson = {}

/** Miniatura: cabeçalho, fundo, cartão com botão e destaque, já com as cores escolhidas (variáveis CSS só dentro da miniatura). */
function Preview({ vars, title }: { vars: Record<string, string>; title: string }) {
  const { membership } = useOrganization()
  return (
    <div aria-label="Prévia" className="overflow-hidden rounded-xl border border-border" style={vars as CSSProperties}>
      <div className="bg-background text-foreground">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-header px-3 py-2 text-header-foreground">
          <span className="flex items-center gap-2 font-display font-extrabold leading-tight">
            <OrgLogo name={membership?.name} logoPath={membership?.logo_path} className="h-7 w-7" /> {title}
          </span>
          <span className="flex items-center gap-3 text-xs font-semibold"><span>Pedidos</span><ShoppingCart className="h-4 w-4" /></span>
        </div>
        <div className="space-y-3 p-3">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-card">
            <p className="font-bold">Camisa 2027</p>
            <p className="text-xs text-muted-foreground">Texto de apoio do produto.</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">Comprar</span>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">Destaque</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Texto sobre o fundo principal.</p>
        </div>
      </div>
    </div>
  )
}

function ColorsEditor({ area, intro }: { area: ThemeArea; intro: string }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const theme = membership?.theme ?? EMPTY_THEME
  const saved = useMemo(() => areaOverrides(theme, area), [theme, area])
  const [colors, setColors] = useState<ThemeColors>(saved)
  useEffect(() => { setColors(saved) }, [saved])
  const dirty = JSON.stringify(areaOverrides(withAreaColors(theme, area, colors), area)) !== JSON.stringify(saved)

  const draft = useMemo(() => withAreaColors(theme, area, colors), [theme, area, colors])
  const vars = useMemo(() => varsForArea(draft, area), [draft, area])
  const title = area === 'general' ? membership?.name ?? 'Sistema' : area === 'site' ? 'Página inicial' : 'Loja'

  const write = async (next: typeof theme) => {
    const { error } = await supabase.from('organizations').update({ theme: next }).eq('id', orgId)
    if (error) throw error
    if (area === 'general') applyTheme(next)
    for (const k of [['memberships'], ['public-org'], ['public-site'], ['shop', 'store']]) qc.invalidateQueries({ queryKey: k })
  }
  const save = useMutation({
    mutationFn: () => write(draft),
    onSuccess: () => notifySaved('Cores salvas.'),
    onError: (e) => toast.error(friendlyError(e)),
  })
  const restore = () => setColors({})

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <UnsavedGuard dirty={dirty} onSave={() => save.mutateAsync()} />
      <Card className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{intro}</p>
        {COLOR_SLOTS.map((s) => (
          <div key={s.key} className="space-y-1" title={s.hint}>
            <ColorPick label={s.label} value={colors[s.key] ?? null} hideDefault={area === 'general' && (s.key === 'primary' || s.key === 'secondary')}
              onChange={(v) => setColors((c) => ({ ...c, [s.key]: v }))} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar cores'}</Button>
          {dirty && <Button variant="ghost" onClick={() => setColors(saved)}>Descartar</Button>}
          {area !== 'general' && <Button variant="outline" onClick={restore}>Restaurar cores de fábrica</Button>}
        </div>
      </Card>
      <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold">Prévia</p>
        <Preview vars={vars} title={title} />
        <p className="text-xs text-muted-foreground">A prévia mostra as cores ainda não salvas.</p>
      </div>
    </div>
  )
}

/** Interface: cores do sistema (Geral), da página inicial (Site) e da loja (Loja). */
export function InterfacePage() {
  const can = usePermission('org.manage')
  const [params] = useSearchParams()
  const [tab, setTab] = useState<ThemeArea>(() => (['site', 'shop'].includes(params.get('area') ?? '') ? (params.get('area') as ThemeArea) : 'general'))
  if (!can) return <Card className="p-6">Você não tem permissão para mudar a interface.</Card>
  const current = AREAS.find((a) => a.key === tab)!
  return (
    <div className="space-y-4">
      <h1>Interface</h1>
      <div role="tablist" className="flex flex-wrap gap-2">
        {AREAS.map((a) => (
          <Button key={a.key} role="tab" aria-selected={tab === a.key} variant={tab === a.key ? 'default' : 'outline'} className={cn('min-h-11')} onClick={() => setTab(a.key)}>{a.label}</Button>
        ))}
      </div>
      <ColorsEditor key={tab} area={tab} intro={current.intro} />
    </div>
  )
}
