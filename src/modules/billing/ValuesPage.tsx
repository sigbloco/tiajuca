import { useState } from 'react'
import { usePermission } from '@/core/permissions'
import { CycleSelect } from '@/modules/cycles/CycleSelect'
import { useCycles } from '@/modules/cycles/service'
import { ContributionsEditor } from './ContributionsEditor'

/** Valores: o valor mensal de cada categoria em cada ciclo (pode haver reajuste de um ciclo para o seguinte). */
export function ValuesPage() {
  const canBilling = usePermission('billing.manage')
  const [cycleId, setCycleId] = useState('')
  const cycles = useCycles()
  const cycle = (cycles.data ?? []).find((c) => c.id === cycleId)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Valores</h1>
        <CycleSelect value={cycleId} onChange={setCycleId} />
      </div>
      <ContributionsEditor canEdit={canBilling} cycle={cycle} />
    </div>
  )
}
