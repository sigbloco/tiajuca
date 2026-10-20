import { usePermission } from '@/core/permissions'
import { TemplatesSettings } from '@/modules/checklists/TemplatesSettings'

export function ChecklistsPage() {
  const canEvents = usePermission('events.manage')
  return <TemplatesSettings canEdit={canEvents} />
}
