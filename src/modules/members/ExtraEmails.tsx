import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Input, Label } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * E-mails adicionais do integrante (além do principal). Qualquer um deles liga a conta Google da pessoa ao cadastro.
 * Cada adição ou remoção é gravada na hora. Só quem gerencia integrantes vê e edita.
 */
export function ExtraEmails({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const can = usePermission('members.manage')
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const key = ['member-emails', memberId]
  const list = useQuery({
    queryKey: key,
    enabled: can,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_emails').select('id, email').eq('member_id', memberId).order('created_at')
      if (error) throw error
      return (data ?? []) as { id: string; email: string }[]
    },
  })
  const add = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from('member_emails').insert({ organization_id: orgId, member_id: memberId, email })
      if (error) throw error
    },
    onSuccess: () => { setValue(''); setAdding(false); qc.invalidateQueries({ queryKey: key }) },
    onError: (e) => toast.error(/duplicate|unique|23505/i.test(JSON.stringify(e)) ? 'Esse e-mail já está em um cadastro.' : friendlyError(e)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('member_emails').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (!can) return null
  const submit = () => {
    const email = value.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { toast.error('Digite um e-mail válido.'); return }
    add.mutate(email)
  }
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex items-center gap-1.5">
        <Label>E-mails adicionais</Label>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Adicionar e-mail" title="Adicionar e-mail"
          onClick={() => setAdding((a) => !a)}><Plus className="h-3.5 w-3.5" /></button>
      </div>
      {(list.data ?? []).length === 0 && !adding && <p className="text-xs text-muted-foreground">Nenhum. Qualquer e-mail da pessoa serve para entrar com a conta Google.</p>}
      {(list.data ?? []).map((e, i) => (
        <div key={e.id} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${i % 2 === 1 ? 'bg-muted/60' : 'bg-muted/25'}`}>
          <span className="min-w-0 break-all">{e.email}</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remover ${e.email}`} title="Remover" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      {adding && (
        <div className="flex items-center gap-2">
          <Input type="email" autoFocus className="min-w-0 flex-1" aria-label="Novo e-mail" placeholder="outro@email.com" value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />
          <Button type="button" size="icon" disabled={add.isPending} aria-label="Salvar e-mail" title="Salvar e-mail" onClick={submit}><Check className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}
