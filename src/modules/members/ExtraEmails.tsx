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
export function ExtraEmails({ memberId, self = false }: { memberId: string; /** No perfil da própria pessoa: ela mesma gerencia os seus. */ self?: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const manage = usePermission('members.manage')
  const can = manage || self
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
  // Quem não é da direção só pede: o e-mail liga uma conta Google ao cadastro, então a direção confere antes.
  const pending = useQuery({
    queryKey: ['email-requests', memberId],
    enabled: can && !manage,
    queryFn: async () => {
      const { data, error } = await supabase.from('email_requests').select('id, email').eq('member_id', memberId).eq('status', 'pending').order('created_at')
      if (error) throw error
      return (data ?? []) as { id: string; email: string }[]
    },
  })
  const add = useMutation({
    mutationFn: async (email: string) => {
      if (manage) { const { error } = await supabase.from('member_emails').insert({ organization_id: orgId, member_id: memberId, email }); if (error) throw error }
      else { const { error } = await supabase.rpc('request_extra_email', { p_member: memberId, p_email: email }); if (error) throw error }
    },
    onSuccess: () => { setValue(''); setAdding(false); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['email-requests', memberId] }); if (!manage) toast.success('Pedido enviado. A direção vai conferir o e-mail.') },
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
        <Label>{self && !manage ? 'Adicionais' : 'E-mails adicionais'}</Label>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Adicionar e-mail" title="Adicionar e-mail"
          onClick={() => setAdding((a) => !a)}><Plus className="h-3.5 w-3.5" /></button>
        {!manage && <span className="min-w-0 whitespace-nowrap text-[clamp(0.6rem,2.7vw,0.75rem)] text-muted-foreground">Sujeito à aprovação da direção.</span>}
      </div>
      {(pending.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(pending.data ?? []).map((e) => <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning px-2.5 py-1 text-sm text-warning"><span className="break-all">{e.email}</span> · aguardando a direção</span>)}
        </div>
      )}
      {(list.data ?? []).length === 0 && (pending.data ?? []).length === 0 && !adding && <p className="text-sm text-muted-foreground">nenhum</p>}
      {(list.data ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(list.data ?? []).map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground">
              <span className="break-all">{e.email}</span>
              <button type="button" aria-label={`Remover ${e.email}`} title="Remover" disabled={remove.isPending} className="rounded-full px-1 text-muted-foreground hover:text-destructive" onClick={() => remove.mutate(e.id)}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      {adding && (
        <div className="flex items-center gap-2">
          <Input type="email" autoFocus className="min-w-0 flex-1" aria-label="Novo e-mail" placeholder="outro@email.com" value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />
          <Button type="button" size="icon" disabled={add.isPending} aria-label={manage ? 'Salvar e-mail' : 'Pedir à direção'} title={manage ? 'Salvar e-mail' : 'Pedir à direção'} onClick={submit}><Check className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}
