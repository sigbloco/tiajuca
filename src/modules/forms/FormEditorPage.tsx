import { FitWord } from '@/components/shared/FitText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useState } from 'react'
import { useRegisterCrumb, useSetCrumbOverride } from '@/core/breadcrumb'
import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, Skeleton, cn } from '@/components/ui/primitives'
import { FitButton } from '@/components/shared/FitButton'
import { useOrganization } from '@/core/organization'
import { FieldsTab } from './FieldsTab'
import { SendTab } from './SendSection'
import { useForm } from './service'
import { SettingsTab } from './SettingsTab'
import { SubmissionsTab } from './SubmissionsTab'

const TABS = [{ key: 'settings', label: 'Configurações' }, { key: 'header', label: 'Cabeçalho' }, { key: 'fields', label: 'Campos' }, { key: 'send', label: 'Envio' }, { key: 'submissions', label: 'Respostas' }] as const

export function FormEditorPage() {
  const { formId = '' } = useParams()
  const { membership } = useOrganization()
  const { data: form, isLoading } = useForm(formId)
  // Cada formulário abre na primeira aba (Configurações).
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('settings')
  useRegisterCrumb(TABS.find((t) => t.key === tab)!.label, () => setTab('settings'), true, 0)
  // Caminho: Formulários • nome do formulário • aba aberta.
  useSetCrumbOverride(form ? [{ label: 'Formulários', to: `/${membership?.slug}/formularios` }, { label: form.title }] : null)
  if (isLoading || !form) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`/${membership?.slug}/formularios`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="min-w-0 flex-1 break-words">{form.title}</h1>
        <FitButton icon={Eye} label="Visualizar" href={`/${membership?.slug}/previa/${form.id}`} newTab />
      </div>
      <ButtonRow role="tablist" split={[2, 3]}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg border border-border px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}><FitWord>{t.label}</FitWord></button>
        ))}
      </ButtonRow>
      {tab === 'fields' && <FieldsTab formId={form.id} onOpenSend={() => setTab('send')} />}
      {tab === 'send' && <SendTab key={`s-${form.updated_at ?? form.id}`} form={form} />}
      {tab === 'settings' && <SettingsTab key={form.updated_at ?? form.id} form={form} />}
      {tab === 'header' && <SettingsTab key={`h-${form.updated_at ?? form.id}`} form={form} part="header" />}
      {tab === 'submissions' && <SubmissionsTab form={form} />}
    </div>
  )
}
