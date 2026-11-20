import { ProgressiveList } from '@/components/shared/LoadMore'
import { useQuery } from '@tanstack/react-query'
import { shortName } from '@/core/format'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { Badge, Button, Card, EmptyState, Sheet, SheetContent, Skeleton } from '@/components/ui/primitives'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { ScholarshipForm } from './MemberBilling'

interface Row {
  id: string
  member_id: string
  percent: number
  reason: string | null
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

/** Indicadores e gestão das bolsas do ciclo escolhido (quem cuida das bolsas). Mesma fonte da geração de cobranças (cycle_scholarships). */
export function ScholarshipsPage() {
  const orgId = useOrgId()
  const [sheet, setSheet] = useState<{ memberId: string; name: string } | 'new' | null>(null)
  const [newMember, setNewMember] = useState('')
  const { cycle } = useSelectedCycle()
  const cycleId = cycle?.id

  const ind = useQuery({
    queryKey: ['scholarships', orgId, 'indicators', cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scholarship_indicators', { p_org: orgId, p_cycle: cycleId })
      if (error) throw error
      return (data as { bolsistas: number; soma_percentual: number; equivalente_integrais: number; impacto_estimado: number }[])[0]
    },
  })
  const list = useQuery({
    queryKey: ['scholarships', orgId, 'list', cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_scholarships')
        .select('id, member_id, percent, reason, members!inner(full_name, display_name), scholarship_types(name)').is('members.archived_at', null)
        .eq('organization_id', orgId).eq('cycle_id', cycleId!).gt('percent', 0).order('percent', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })
  const rows = list.data ?? []
  const i = ind.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>Bolsas</h1>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="add" disabled={!cycleId} onClick={() => { setNewMember(''); setSheet('new') }}><Plus className="h-4 w-4" /> Nova bolsa</Button></div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Pessoas bolsistas" value={String(i?.bolsistas ?? 0)} />
        <Stat label="Soma dos percentuais" value={`${Number(i?.soma_percentual ?? 0).toLocaleString('pt-BR')}%`} />
        <Stat label="Equivalente em bolsas integrais" value={Number(i?.equivalente_integrais ?? 0).toLocaleString('pt-BR')} hint="soma ÷ 100" />
        <Stat label="Impacto mensal estimado" value={formatCurrency(Number(i?.impacto_estimado ?? 0))} hint="pelo valor de cada categoria no ciclo" />
      </div>

      {!cycleId && <EmptyState>Escolha um ciclo.</EmptyState>}
      {list.isLoading && <Skeleton className="h-24" />}
      {cycleId && rows.length === 0 && !list.isLoading && <EmptyState>Nenhuma bolsa em {cycle?.name ?? 'este ciclo'}.</EmptyState>}
      <div className="grid gap-2">
        <ProgressiveList items={rows} resetKey={cycleId} render={(r) => {
          const name = shortName(r.members?.full_name, r.members?.display_name) ?? ''
          const detail = [r.scholarship_types?.name, r.reason].filter(Boolean).join(' · ')
          return (
            <Card key={r.id} className="flex items-center justify-between gap-3 p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ memberId: r.member_id, name })}>
                <p className="break-words font-semibold">{name}</p>
                {detail && <p className="break-words text-muted-foreground">{detail}</p>}
              </button>
              <Badge className="bg-primary/15 text-primary">{Number(r.percent).toLocaleString('pt-BR')}%</Badge>
            </Card>
          )
        }} />
      </div>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        {sheet && cycleId && (
          <SheetContent title={sheet === 'new' ? 'Nova bolsa' : sheet.name} description={`Bolsa em ${cycle?.name ?? 'este ciclo'}. 0% remove a bolsa do ciclo. Vale a partir das próximas cobranças geradas.`}>
            {sheet === 'new' && <MemberPicker value={newMember} onChange={setNewMember} />}
            {(sheet !== 'new' || newMember) && (
              <ScholarshipForm key={`${sheet === 'new' ? newMember : sheet.memberId}-${cycleId}`} memberId={sheet === 'new' ? newMember : sheet.memberId} cycleId={cycleId} onSaved={() => setSheet(null)} />
            )}
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}
