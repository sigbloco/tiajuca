import { FitWord } from '@/components/shared/FitText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { useState } from 'react'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { cn } from '@/components/ui/primitives'
import { todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { DistributionTab } from './DistributionTab'
import { LedgerTab } from './LedgerTab'

const TABS = [
  { key: 'income', label: 'Receitas' },
  { key: 'expense', label: 'Despesas' },
  { key: 'distribution', label: 'Distribuição' },
] as const

/** Financeiro (somente Direção — o banco recusa para os demais). */
export function FinancePage() {
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  const [tab, setTab] = useRememberedState<(typeof TABS)[number]['key']>('financeiro-aba', 'income', TABS.map((t) => t.key))
  useRegisterCrumb(TABS.find((t) => t.key === tab)!.label, () => setTab('income'), true, 0)
  const competence = toCompetence(ym)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Financeiro</h1>
        <MonthNav value={ym} onChange={setYm} />
      </div>
      <ButtonRow role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'bg-primary text-primary-foreground hover:bg-primary')}>
            <FitWord>{t.label}</FitWord>
          </button>
        ))}
      </ButtonRow>
      {(tab === 'income' || tab === 'expense') && <LedgerTab key={tab} kind={tab} competence={competence} />}
      {tab === 'distribution' && <DistributionTab competence={competence} />}
    </div>
  )
}
