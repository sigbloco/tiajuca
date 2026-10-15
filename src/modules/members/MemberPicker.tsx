import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Input, Select } from '@/components/ui/primitives'
import { useOrgId } from '@/core/organization'
import { listMembers } from './service'

/** Busca integrantes no banco (debounce + limite) e permite escolher um. */
export function MemberPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const orgId = useOrgId()
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300)
    return () => clearTimeout(t)
  }, [text])
  const { data } = useQuery({
    queryKey: ['member-picker', orgId, term],
    queryFn: () => listMembers({ orgId, search: term, page: 0, pageSize: 15, sort: 'full_name', ascending: true, includeArchived: false }),
  })
  return (
    <div className="space-y-1.5">
      <Input placeholder="Buscar integrante…" value={text} onChange={(e) => setText(e.target.value)} />
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Integrante">
        <option value="">Selecione…</option>
        {data?.rows.map((m) => <option key={m.id} value={m.id}>{m.display_name ?? m.full_name}</option>)}
      </Select>
    </div>
  )
}
