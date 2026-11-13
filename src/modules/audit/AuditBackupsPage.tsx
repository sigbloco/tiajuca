import { ButtonRow } from '@/components/shared/ButtonRow'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { cn } from '@/components/ui/primitives'
import { usePermission } from '@/core/permissions'
import { AuditLogTab } from './AuditPage'
import { BackupsTab } from './BackupsTab'

/** Auditoria e backups: o registro de quem fez o quê e as cópias de segurança dos dados do bloco. */
export function AuditBackupsPage() {
  const canBackup = usePermission('backups.manage')
  const [tab, setTab] = useRememberedState<'audit' | 'backups'>('auditoria-aba', 'audit', ['audit', 'backups'])
  useRegisterCrumb(tab === 'backups' ? 'Backups' : 'Auditoria', () => setTab('audit'), canBackup, 0)
  return (
    <div className="space-y-4">
      <h1>Auditoria e backups</h1>
      {canBackup && (
        <ButtonRow role="tablist">
          {([['audit', 'Auditoria'], ['backups', 'Backups']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-full px-4 py-1.5 font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>{l}</button>
          ))}
        </ButtonRow>
      )}
      {tab === 'backups' && canBackup ? <BackupsTab /> : <AuditLogTab />}
    </div>
  )
}
