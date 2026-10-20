import { useQuery } from '@tanstack/react-query'
import { usePersonLabeler } from './personLabel'
import { useMemberStatus } from './useMemberStatus'
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Input, cn } from '@/components/ui/primitives'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'

interface Person { id: string; full_name: string; display_name: string | null; email: string | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca integrantes (sem diferenciar acentos nem maiúsculas) e mostra os resultados na hora, abaixo do campo. */
export function MemberPicker({ value, onChange, onlyActive }: { value: string; onChange: (id: string) => void; /** Esconde quem está inativo no ciclo atual (para escolher equipe). */ onlyActive?: boolean }) {
  const labeler = usePersonLabeler()
  const { isInactive } = useMemberStatus()
  const orgId = useOrgId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['members', orgId, 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('id, full_name, display_name, email')
        .eq('organization_id', orgId).is('archived_at', null).order('full_name').limit(2000)
      if (error) throw error
      return (data ?? []) as Person[]
    },
  })
  const label = (p: Person) => labeler(p)
  const selected = (data ?? []).find((p) => p.id === value)
  const matches = useMemo(() => {
    const q = norm(text.trim())
    return (data ?? []).filter((p) => !(onlyActive && isInactive(p.id)) && (!q || norm(`${p.full_name} ${p.display_name ?? ''} ${p.email ?? ''}`).includes(q))).slice(0, 8)
  }, [data, text, onlyActive, isInactive, labeler]) // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="min-w-0 truncate font-semibold">{label(selected)}</span>
        <Button type="button" size="sm" variant="ghost" aria-label="Trocar integrante" onClick={() => { onChange(''); setText('') }}><X className="h-4 w-4" /> Trocar</Button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input className="pl-9" placeholder="Buscar integrante pelo nome ou e-mail…" value={text} autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true) }} />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card shadow-card">
          {matches.length === 0 && <li className="px-3 py-2 text-muted-foreground">Ninguém encontrado.</li>}
          {matches.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button type="button" className={cn('w-full px-3 py-2 text-left hover:bg-muted')}
                onClick={() => { onChange(p.id); setOpen(false); setText('') }}>
                <span className="font-semibold">{labeler(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
