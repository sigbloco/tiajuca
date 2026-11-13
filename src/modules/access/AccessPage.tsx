import { FitWord } from '@/components/shared/FitText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Sheet, SheetContent, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberPicker } from '@/modules/members/MemberPicker'
import { PeopleTab } from './PeopleTab'
import { PermissionsMatrix } from './PermissionsMatrix'

function useIsTitular() {
  const { membership } = useOrganization()
  return Boolean(membership?.roles.includes('titular'))
}

/** O bloco já tem titular? Então só ele mexe na Direção. */
function useOrgHasTitular() {
  const orgId = useOrgId()
  return useQuery({
    queryKey: ['org-has-titular', orgId],
    queryFn: async () => {
      const { count, error } = await supabase.from('member_access_roles')
        .select('id, access_roles!inner(key)', { count: 'exact', head: true }).eq('organization_id', orgId).eq('access_roles.key', 'titular').is('revoked_at', null)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

function TransferSheet({ onClose }: { onClose: () => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [to, setTo] = useState('')
  const transfer = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('transfer_titular', { p_org: orgId, p_to_member: to }); if (error) throw error },
    onSuccess: () => { toast.success('Titularidade transferida. Você deixou de ser o titular.'); qc.invalidateQueries(); onClose() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <SheetContent title="Transferir titularidade" description="A nova pessoa passa a controlar tudo, inclusive a Direção. Você perde esse papel e todas as permissões ligadas a ele.">
      <MemberPicker value={to} onChange={setTo} />
      <p className="text-xs text-muted-foreground">A pessoa precisa ter conta de acesso vinculada ao cadastro.</p>
      <Button disabled={!to || transfer.isPending} onClick={async () => { if (await confirmBox('Transferir a titularidade do bloco? Esta ação só pode ser desfeita pelo novo titular.')) transfer.mutate() }}>Transferir titularidade</Button>
    </SheetContent>
  )
}

function PeopleTabContainer() {
  const isTitular = useIsTitular()
  const hasTitular = useOrgHasTitular()
  const [transfer, setTransfer] = useState(false)
  return (
    <>
      <PeopleTab canTouchDirection={isTitular || hasTitular.data === false} hasTitular={Boolean(hasTitular.data)} isTitular={isTitular} onTransfer={() => setTransfer(true)} />
      <Sheet open={transfer} onOpenChange={setTransfer}>{transfer && <TransferSheet onClose={() => setTransfer(false)} />}</Sheet>
    </>
  )
}

export function AccessPage() {
  const [tab, setTab] = useRememberedState<'people' | 'perms'>('acesso-aba', 'people', ['people', 'perms'])
  useRegisterCrumb(tab === 'people' ? 'Pessoas' : 'Permissões dos papéis', () => setTab('people'), true, 0)
  return (
    <div className="space-y-4">
      <h1>Acesso e papéis</h1>
      <ButtonRow role="tablist">
        {[['people', 'Pessoas'], ['perms', 'Permissões dos papéis']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k as typeof tab)}
            className={cn('rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === k && 'bg-primary text-primary-foreground hover:bg-primary')}><FitWord>{l}</FitWord></button>
        ))}
      </ButtonRow>
      {tab === 'people' ? <PeopleTabContainer /> : <PermissionsMatrix />}
    </div>
  )
}
