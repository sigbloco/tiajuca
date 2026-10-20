import { useQuery } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { formatCurrency, formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { ScholarshipForm } from './MemberBilling'

interface Row {
  id: string
  member_id: string
  percent: number
  reason: string | null
  valid_from: string
  members: { full_name: string; display_name: string | null } | null
  scholarship_types: { name: string } | null
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** Indicadores e gestão de bolsas (somente Direção). */
export function ScholarshipsPage() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<{ memberId: string; name: string } | 'new' | null>(null)
  const [newMember, setNewMember] = useState('')

  const ind = useQuery({
    queryKey: ['scholarships', orgId, 'indicators'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scholarship_indicators', { p_org: orgId })
      if (error) throw error
      return (data as { bolsistas: number; soma_percentual: number; equivalente_integrais: number; impacto_estimado: number }[])[0]
    },
  })
  const list = useQuery({
    queryKey: ['scholarships', orgId, 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scholarships')
        .select('id, member_id, percent, reason, valid_from, members(full_name, display_name), scholarship_types(name)')
        .eq('organization_id', orgId).is('valid_to', null).order('percent', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })
  const i = ind.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>Bolsas</h1>
        <Button onClick={() => { setNewMember(''); setSheet('new') }}><Plus className="h-4 w-4" /> Nova bolsa</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Pessoas bolsistas" value={String(i?.bolsistas ?? 0)} />
        <Stat label="Soma dos percentuais" value={`${Number(i?.soma_percentual ?? 0).toLocaleString('pt-BR')}%`} />
        <Stat label="Equivalente em bolsas integrais" value={Number(i?.equivalente_integrais ?? 0).toLocaleString('pt-BR')} hint="soma ÷ 100" />
        <Stat label="Impacto mensal estimado" value={formatCurrency(Number(i?.impacto_estimado ?? 0))} hint="pelo valor atual de cada categoria" />
      </div>

      {list.isLoading && <Skeleton className="h-24" />}
      {list.data?.length === 0 && <EmptyState>Nenhuma bolsa ativa.</EmptyState>}
      <div className="grid gap-2">
        {list.data?.map((r) => {
          const name = shortName(r.members?.full_name, r.members?.display_name) ?? ''
          return (
            <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ memberId: r.member_id, name })}>
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-muted-foreground">
                  {r.scholarship_types?.name ? `${r.scholarship_types.name} · ` : ''}desde {formatDate(r.valid_from)}{r.reason ? ` · ${r.reason}` : ''}
                </p>
              </button>
              <Badge className="bg-primary/15 text-primary">{Number(r.percent).toLocaleString('pt-BR')}%</Badge>
            </Card>
          )
        })}
      </div>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && (
          <SheetContent title={sheet === 'new' ? 'Nova bolsa' : sheet.name} description="0% encerra a bolsa. Vale a partir das próximas cobranças geradas.">
            {sheet === 'new' && <MemberPicker value={newMember} onChange={setNewMember} />}
            {(sheet !== 'new' || newMember) && (
              <ScholarshipForm key={sheet === 'new' ? newMember : sheet.memberId} memberId={sheet === 'new' ? newMember : sheet.memberId} onSaved={() => setSheet(null)} />
            )}
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}
