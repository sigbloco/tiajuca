import { FitWord } from '@/components/shared/FitText'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { useRememberedState } from '@/core/rememberedState'
import { useRegisterCrumb, useSetCrumbOverride } from '@/core/breadcrumb'
import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, Skeleton, cn } from '@/components/ui/primitives'
import { FitButton } from '@/components/shared/FitButton'
import { useOrganization } from '@/core/organization'
import { FieldsTab } from './FieldsTab'
import { useForm } from './service'
import { SettingsTab } from './SettingsTab'
import { SubmissionsTab } from './SubmissionsTab'

const TABS = [{ key: 'settings', label: 'Configurações' }, { key: 'fields', label: 'Campos' }, { key: 'submissions', label: 'Respostas' }] as const

export function FormEditorPage() {
  const { formId = '' } = useParams()
  const { membership } = useOrganization()
  const { data: form, isLoading } = useForm(formId)
  const [tab, setTab] = useRememberedState<(typeof TABS)[number]['key']>('formulario-aba', 'fields', TABS.map((t) => t.key))
  useRegisterCrumb(TABS.find((t) => t.key === tab)!.label, () => setTab('fields'), true, 0)
  // Caminho: Inscrições • nome do formulário • aba aberta.
  useSetCrumbOverride(form ? [{ label: 'Inscrições', to: `/${membership?.slug}/inscricoes` }, { label: form.title }] : null)
  if (isLoading || !form) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`/${membership?.slug}/inscricoes`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="min-w-0 flex-1 break-words">{form.title}</h1>
        <FitButton icon={Eye} label="Visualizar" href={`/${membership?.slug}/previa/${form.id}`} newTab />
      </div>
      <ButtonRow role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('whitespace-nowrap rounded-lg border border-border px-3 py-2 font-semibold hover:bg-muted', tab === t.key && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}><FitWord>{t.label}</FitWord></button>
        ))}
      </ButtonRow>
      {tab === 'fields' && <FieldsTab formId={form.id} />}
      {tab === 'settings' && <SettingsTab key={form.updated_at ?? form.id} form={form} />}
      {tab === 'submissions' && <SubmissionsTab form={form} />}
    </div>
  )
}
