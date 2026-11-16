import { useState } from 'react'
import { MonthNav, toCompetence, type YearMonth } from '@/components/shared/MonthNav'
import { todayIso } from '@/core/format'
import { useOrganization } from '@/core/organization'
import { StaffTab } from './StaffTab'

/** Financeiro → Pagamentos: os pagamentos da equipe, mês a mês (o que cada pessoa recebe é definido em Distribuição). */
export function PaymentsPage() {
  const { membership } = useOrganization()
  const today = todayIso(membership?.timezone)
  const [ym, setYm] = useState<YearMonth>({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })
  return (
    <div className="space-y-4">
      <div className="flex justify-center"><MonthNav value={ym} onChange={setYm} /></div>
      <StaffTab competence={toCompetence(ym)} />
    </div>
  )
}
