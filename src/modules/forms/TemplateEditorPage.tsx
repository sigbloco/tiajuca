import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, Skeleton } from '@/components/ui/primitives'
import { useSetCrumbOverride } from '@/core/breadcrumb'
import { useOrganization } from '@/core/organization'
import { FieldsTab } from './FieldsTab'
import { useSectionTemplates } from './SectionTemplatesPage'

/** Edita uma seção modelo com o mesmo editor dos formulários (ordem, ocultar, apagar, adicionar e editar perguntas). As mudanças valem para as próximas inserções. */
export function TemplateEditorPage() {
  const { templateId = '' } = useParams()
  const { membership } = useOrganization()
  const { data, isLoading } = useSectionTemplates()
  const t = data?.find((x) => x.id === templateId)
  const base = `/${membership?.slug}/formularios`
  useSetCrumbOverride(t ? [
    { label: 'Formulários', to: base }, { label: 'Configurações', to: `${base}/configuracoes` }, { label: 'Seções modelo', to: `${base}/configuracoes` }, { label: t.name },
  ] : null)
  if (isLoading) return <Skeleton className="h-40" />
  if (!t) return <p className="text-muted-foreground">Modelo não encontrado.</p>
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Voltar"><Link to={`${base}/configuracoes`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="min-w-0 flex-1 break-words">{t.name}</h1>
      </div>
      <p className="text-muted-foreground">Modelo de seção. Mudar aqui não altera formulários que já o usaram; vale para as próximas inserções.</p>
      <FieldsTab formId={t.form_id} templateMode />
    </div>
  )
}
