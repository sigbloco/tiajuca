import { useState } from 'react'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { cn } from '@/components/ui/primitives'
import { todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { ContributionsEditor } from '@/modules/billing/ContributionsEditor'
import { DistributionTab } from './DistributionTab'
import { LedgerTab } from './LedgerTab'
import { StaffTab } from './StaffTab'

const TABS = [
  { key: 'income', label: 'Receitas' },
  { key: 'expense', label: 'Despesas' },
  { key: 'distribution', label: 'Distribuição' },
  { key: 'staff', label: 'Equipe' },
  { key: 'fees', label: 'Contribuições' },
] as const

/** Financeiro (somente Direção — o banco recusa para os demais). */
export function FinancePage() {
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('income')
  const canBilling = usePermission('billing.manage')
  const competence = toCompetence(ym)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Financeiro</h1>
        <MonthNav value={ym} onChange={setYm} />
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'bg-primary text-primary-foreground hover:bg-primary')}>
            {t.label}
          </button>
        ))}
      </div>
      {(tab === 'income' || tab === 'expense') && <LedgerTab key={tab} kind={tab} competence={competence} />}
      {tab === 'distribution' && <DistributionTab competence={competence} />}
      {tab === 'staff' && <StaffTab competence={competence} />}
      {tab === 'fees' && <ContributionsEditor canEdit={canBilling} />}
    </div>
  )
}
