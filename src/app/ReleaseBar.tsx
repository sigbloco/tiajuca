import { Lock } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { useCategoryAccess, usePageReleaseRows, useSetReleases } from '@/modules/access/releaseData'
import { RELEASE_CATEGORIES, pageAccessible, pageKeyForPath, rawReleased, releasePage } from '@/modules/access/releases'

/**
 * Linha fixa no topo: para quem a página aberta está liberada. Titular marca e desmarca; a Direção só vê.
 * A caixa fica desmarcada e desabilitada quando a categoria não tem acesso à página em "Acesso e papéis".
 * Subpágina de uma área só pode ser marcada com a área liberada.
 */
export function ReleaseBar({ base }: { base: string }) {
  const { realMembership } = useOrganization()
  const { pathname } = useLocation()
  const isTitular = !!realMembership?.roles.includes('titular')
  const seen = isTitular || !!realMembership?.roles.includes('direcao')
  const rows = usePageReleaseRows()
  const access = useCategoryAccess(seen)
  const set = useSetReleases()
  const key = pageKeyForPath(pathname.slice(base.length))
  const page = key ? releasePage(key) : undefined
  if (!seen || !page) return null
  const ready = !!rows.data && !!access.data

  return (
    <div className="border-t border-border/60 py-1.5" role="group" aria-label="Página liberada para">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden /> Página liberada para:</p>
      {/* Celular e tela média: 3+2 de colunas iguais. Tela grande: as 5 numa linha, com fonte menor para o nome inteiro caber. */}
      <div className="grid grid-cols-6 items-center gap-1.5 lg:grid-cols-5">
        {RELEASE_CATEGORIES.map((c, i) => {
          const hasAccess = !access.data || pageAccessible(page, access.data[c.key])
          const hubOff = !!page.hub && !rawReleased(rows.data ?? new Map(), page.hub, c.key)
          const checked = hasAccess && rawReleased(rows.data ?? new Map(), page.key, c.key)
          const disabled = !isTitular || !ready || !hasAccess || hubOff || set.isPending
          const why = !hasAccess ? `${c.label} não tem acesso a esta página em Acesso e papéis.` : hubOff ? `Libere primeiro a área ${releasePage(page.hub!)?.label} para ${c.label}.` : !isTitular ? 'Só o Titular altera.' : undefined
          return (
            <label key={c.key} title={why}
              className={cn('flex min-h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2 text-sm font-semibold lg:gap-1 lg:px-1 lg:text-xs',
                i < 3 ? 'col-span-2' : 'col-span-3', 'lg:col-span-1', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted', checked && !disabled && 'border-primary')}>
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={checked} disabled={disabled}
                onChange={(e) => set.mutate([{ page: page.key, category: c.key, released: e.target.checked }])} />
              <span>{c.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
