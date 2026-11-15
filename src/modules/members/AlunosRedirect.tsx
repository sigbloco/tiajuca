import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/primitives'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

/**
 * Oficina → Alunos abre Integrantes já com o chip "Alunos". Para professor e monitor (que não são direção), abre também no que eles atendem:
 * uma atribuição só → naipe e atividade já escolhidos; várias → o chip "Meus alunos" (a soma de tudo o que atendem), que dá para desligar.
 */
export function AlunosRedirect() {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const instruments = useCatalog('instruments')
  const mine = useQuery({
    queryKey: ['staff-redirect', orgId, membership?.member_id],
    enabled: Boolean(membership?.member_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_assignments').select('section_id, instrument_id, cycles!inner(is_current)').eq('organization_id', orgId).eq('member_id', membership!.member_id).is('valid_to', null).in('staff_kind', ['professor', 'monitor']).eq('cycles.is_current', true)
      if (error) throw error
      return (data ?? []) as unknown as { section_id: string | null; instrument_id: string | null }[]
    },
  })
  if (mine.isLoading || instruments.isLoading) return <Skeleton className="h-10" />
  const roles = membership?.roles ?? []
  const params = new URLSearchParams({ tipo: 'aluno' })
  const list = mine.data ?? []
  if (!roles.includes('direcao') && !roles.includes('titular') && list.length > 0) {
    if (list.length === 1) {
      const a = list[0]
      const sec = a.section_id ?? instruments.data?.find((i) => i.id === a.instrument_id)?.section_id
      if (sec) params.set('naipeId', sec)
      if (a.instrument_id) params.set('atividadeId', a.instrument_id)
      params.set('meus', '1') // o chip "Meus alunos" já abre marcado
    } else params.set('meus', '1')
  }
  return <Navigate to={`../membros?${params.toString()}`} replace relative="path" />
}
