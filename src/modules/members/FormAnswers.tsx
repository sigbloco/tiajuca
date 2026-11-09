import { useQuery } from '@tanstack/react-query'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { MemberSection } from './MemberSection'

interface Answer { id: string; cycle_label: string; affective_relation: string | null; other_blocks: string | null; created_at: string; cycle_id: string | null }

/**
 * Respostas de formulário que variam por ciclo (relação com a Grande Tijuca e outros blocos).
 * Acumulam no fim da ficha: cada ciclo guarda a sua resposta, da mais recente para a mais antiga.
 */
export function FormAnswers({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const { data } = useQuery({
    queryKey: ['member-form-answers', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_form_answers').select('id, cycle_label, affective_relation, other_blocks, created_at, cycle_id')
        .eq('member_id', memberId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Answer[]
    },
  })
  if (!data || data.length === 0) return null
  // Mais recente primeiro: ciclos atuais antes dos antigos; no mesmo ciclo, a inscrição mais nova.
  const rows = [...data].sort((a, b) => b.cycle_label.localeCompare(a.cycle_label, 'pt-BR') || b.created_at.localeCompare(a.created_at))
  return (
    <MemberSection title="Respostas dos formulários, por ciclo">
      <div className="space-y-2">
        {rows.map((a, k) => (
          <div key={a.id} className={`space-y-1 rounded-md p-2 ${k % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25'}`}>
            <p className="font-semibold">{a.cycle_label}</p>
            {a.affective_relation && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Relação com a Grande Tijuca: </span>{a.affective_relation}</p>}
            {a.other_blocks && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Outros blocos: </span>{a.other_blocks}</p>}
          </div>
        ))}
      </div>
    </MemberSection>
  )
}
