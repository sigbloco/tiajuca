import { useState } from 'react'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { LedgerTab } from './LedgerTab'

/** Financeiro → Receitas / Despesas: uma página para cada, mês a mês. */
export function LedgerPage({ kind }: { kind: 'income' | 'expense' }) {
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><MonthNav value={ym} onChange={setYm} /></div>
      <LedgerTab kind={kind} competence={toCompetence(ym)} />
    </div>
  )
}
