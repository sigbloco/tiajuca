import { usePermission } from '@/core/permissions'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import { ContributionsEditor } from './ContributionsEditor'

/** Valores: o valor mensal de cada categoria no ciclo escolhido (pode haver reajuste de um ciclo para o seguinte). */
export function ValuesPage() {
  const canBilling = usePermission('billing.manage')
  const { cycle } = useSelectedCycle()
  return (
    <div className="space-y-4">
      <h1>Valores</h1>
      <ContributionsEditor canEdit={canBilling} cycle={cycle} />
    </div>
  )
}
