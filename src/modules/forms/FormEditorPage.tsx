import { FitWord } from '@/components/shared/FitText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb } from '@/core/breadcrumb'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Skeleton, cn } from '@/components/ui/primitives'
import { useOrganization } from '@/core/organization'
import { FieldsTab } from './FieldsTab'
import { FORM_STATUS_CLASS, FORM_STATUS_LABEL, useForm } from './service'
import { SettingsTab } from './SettingsTab'
import { SubmissionsTab } from './SubmissionsTab'

const TABS = [{ key: 'fields', label: 'Campos' }, { key: 'settings', label: 'Configurações' }, { key: 'submissions', label: 'Respostas' }] as const

export function FormEditorPage() {
  const { formId = '' } = useParams()
  const { membership } = useOrganization()
  const { data: form, isLoading } = useForm(formId)
  const [tab, setTab] = useRememberedState<(typeof TABS)[number]['key']>('formulario-aba', 'fields', TABS.map((t) => t.key))
  useRegisterCrumb(TABS.find((t) => t.key === tab)!.label, () => setTab('fields'), true, 0)
  if (isLoading || !form) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`/${membership?.slug}/inscricoes`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="min-w-0 flex-1 break-words">{form.title}</h1>
        <Badge className={FORM_STATUS_CLASS[form.status]}>{FORM_STATUS_LABEL[form.status]}</Badge>
      </div>
      <ButtonRow role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'bg-primary text-primary-foreground hover:bg-primary')}><FitWord>{t.label}</FitWord></button>
        ))}
      </ButtonRow>
      {tab === 'fields' && <FieldsTab formId={form.id} />}
      {tab === 'settings' && <SettingsTab key={form.updated_at ?? form.id} form={form} />}
      {tab === 'submissions' && <SubmissionsTab form={form} />}
    </div>
  )
}
