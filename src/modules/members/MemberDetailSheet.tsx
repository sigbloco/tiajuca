import { formatDate, shortName } from '@/core/format'

function ageOf(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const now = new Date()
  let age = now.getFullYear() - Number(m[1])
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age--
  return age >= 0 ? age : null
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { toast } from 'sonner'
import { Cake, Globe, Mail, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Input, Label, SheetContent, Skeleton } from '@/components/ui/primitives'
import { maskPhone, PhoneInput } from '@/components/ui/masked-inputs'
import { socialLabel, socialUrl } from '@/core/social'
import { whatsappUrl } from '@/modules/suppliers/service'
import { OkSelect } from '@/components/shared/ConfirmField'
import { friendlyError } from '@/core/errors'
import { notifyChange } from '@/core/undo'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { isPastCycle, setMemberCycleStatus, useCycleStatuses, useCycles } from '@/modules/cycles/service'
import { MemberBilling } from '@/modules/billing/MemberBilling'
import { MemberRole } from './MemberRole'
import { MySensitiveData } from '@/modules/profile/MyData'
import { ArtisticLinks } from './ArtisticLinks'
import { InstagramIcon, MemberSection, WhatsAppIcon } from './MemberSection'
import type { MemberRow } from './service'

function CycleParticipation({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const canManage = usePermission('member_cycles.manage', 'group')
  const canForce = usePermission('capacity.manage')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['member-cycles', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('cycle_id, status_id').eq('member_id', memberId)
      if (error) throw error
      return data as { cycle_id: string; status_id: string }[]
    },
  })

  const change = useMutation({
    mutationFn: (v: { cycle: string; status: string; force?: boolean }) => setMemberCycleStatus({ member: memberId, ...v }),
    onSuccess: (_d, v) => {
      const before = statuses?.find((s) => s.id === rows?.find((r) => r.cycle_id === v.cycle)?.status_id)?.key
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ['member-cycles', orgId, memberId] })
        qc.invalidateQueries({ queryKey: ['capacity', orgId] })
        qc.invalidateQueries({ queryKey: ['members'] })
      }
      refresh()
      notifyChange('Status atualizado.', before ? async () => { await setMemberCycleStatus({ member: memberId, cycle: v.cycle, status: before, force: true }); refresh() } : undefined)
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (canForce && /lotado/i.test(msg) && !v.force) {
        toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => change.mutate({ ...v, force: true }) } })
      } else toast.error(msg)
    },
  })

  return (
    <MemberSection level={2} title="Ciclos">
      {isLoading && <Skeleton className="h-16" />}
      {cycles?.filter((c) => c.is_active).map((c) => {
        const current = statuses?.find((s) => s.id === rows?.find((r) => r.cycle_id === c.id)?.status_id)
        const past = isPastCycle(c)
        // Ciclo que já passou: "Participou" / "Não participou"; Ativo/Inativo é só do ciclo atual.
        const optionsFor = past ? (statuses ?? []).filter((s) => !s.is_waitlist) : (statuses ?? [])
        const labelOf = (s: { name: string; counts_as_active: boolean; is_waitlist: boolean }) => (past && !s.is_waitlist ? (s.counts_as_active ? 'Participou' : 'Não participou') : s.name)
        return (
          <div key={c.id} className="flex items-center justify-between gap-2">
            <p className="font-semibold">{c.name}</p>
            <OkSelect
              className="w-40"
              disabled={!canManage}
              value={current?.key ?? ''}
              onSave={(v) => change.mutateAsync({ cycle: c.id, status: v })}
              aria-label={`Status em ${c.name}`}
            >
              {!current && <option value="">Sem registro</option>}
              {current && past && current.is_waitlist && <option value={current.key}>{current.name}</option>}
              {optionsFor.map((s) => <option key={s.id} value={s.key}>{labelOf(s)}</option>)}
            </OkSelect>
          </div>
        )
      })}
    </MemberSection>
  )
}

function ContactLinks({ member }: { member: MemberRow }) {
  const socials = (member.social_handle ?? '').split('\n').map((x) => socialUrl(x)).filter((x): x is string => !!x)
  const wa = whatsappUrl(member.phone)
  if (!member.phone && socials.length === 0 && !member.email && !member.birth_date) return null
  const cls = 'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm hover:bg-muted'
  return (
    <div className="flex flex-wrap gap-2">
      {member.phone && <a className={cls} href={wa ?? `tel:${member.phone}`} target="_blank" rel="noreferrer noopener" aria-label="WhatsApp"><WhatsAppIcon className="h-4 w-4 text-success" /> {maskPhone(member.phone)}</a>}
      {socials.map((social) => (
        <a key={social} className={cls} href={social} target="_blank" rel="noreferrer noopener">
          {/instagram\.com/i.test(social) ? <InstagramIcon className="h-4 w-4" /> : <Globe className="h-4 w-4" />} {socialLabel(social)}
        </a>
      ))}
      {member.email && <a className={cls} href={`mailto:${member.email}`} aria-label="E-mail"><Mail className="h-4 w-4" /> {member.email}</a>}
      {member.birth_date && <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm" aria-label="Data de nascimento"><Cake className="h-4 w-4" /> {formatDate(member.birth_date)}</span>}
    </div>
  )
}

interface Registration { birth_date: string | null; joined_at: string | null; affective_relation: string | null; played_other_blocks: boolean; other_blocks: string | null }
const toList = (v: string | null) => { const l = (v ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return l.length ? l : [''] }

/** Dados cadastrais: só quem pode gerenciar integrantes (Titular e Direção) edita — todos os campos. */
function RegistrationEditor({ member, onChanged }: { member: MemberRow; onChanged: (p: Partial<MemberRow>) => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const reg = useQuery({
    queryKey: ['member-registration', orgId, member.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('birth_date, joined_at, affective_relation, played_other_blocks, other_blocks').eq('id', member.id).single()
      if (error) throw error
      return data as Registration
    },
  })
  const [f, setF] = useState({ full_name: '', display_name: '', email: '', phone: '', socials: [''], birth_date: '', joined_at: '', affective_relation: '', played_other_blocks: false, other_blocks: '' })
  useEffect(() => {
    const d = reg.data
    if (!d) return
    setF({
      full_name: member.full_name, display_name: member.display_name ?? '', email: member.email ?? '', phone: member.phone ? maskPhone(member.phone) : '', socials: toList(member.social_handle),
      birth_date: d.birth_date ?? '', joined_at: d.joined_at ?? '', affective_relation: d.affective_relation ?? '', played_other_blocks: d.played_other_blocks, other_blocks: d.other_blocks ?? '',
    })
  }, [reg.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const digits = f.phone.replace(/\D/g, '')
  const phoneOk = digits === '' || (digits.length >= 10 && digits.length <= 13)
  const save = useMutation({
    mutationFn: async () => {
      const nn = (v: string) => (v.trim() ? v.trim() : null)
      const patch = {
        full_name: f.full_name.trim(), display_name: nn(f.display_name), email: nn(f.email)?.toLowerCase() ?? null, phone: digits || null,
        social_handle: f.socials.map((x) => socialUrl(x)).filter(Boolean).join('\n') || null,
        birth_date: f.birth_date || null, joined_at: f.joined_at || null, affective_relation: nn(f.affective_relation),
        played_other_blocks: f.played_other_blocks, other_blocks: f.played_other_blocks ? nn(f.other_blocks) : null,
      }
      const { error } = await supabase.from('members').update(patch).eq('id', member.id)
      if (error) throw error
      return patch
    },
    onSuccess: (p) => {
      toast.success('Dados atualizados.')
      onChanged({ full_name: p.full_name, display_name: p.display_name, email: p.email, phone: p.phone, social_handle: p.social_handle, birth_date: p.birth_date })
      qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['member-registration', orgId, member.id] }); qc.invalidateQueries({ queryKey: ['memberships'] })
      setOpen(false)
    },
    onError: (e) => toast.error(friendlyError(e)),
  })

  if (!open) return <div><Button size="icon" variant="outline" aria-label="Editar dados" title="Editar dados" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button></div>
  if (!reg.data) return <Skeleton className="h-24" />
  const fld = (id: string, label: string, el: ReactNode) => <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{el}</div>
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <form onSubmit={(e) => { e.preventDefault(); if (phoneOk) save.mutate() }} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {fld('rd-full', 'Nome completo', <Input id="rd-full" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />)}
          {fld('rd-display', 'Como prefere ser chamado(a)', <Input id="rd-display" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />)}
          {fld('rd-email', 'E-mail', <Input id="rd-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />)}
          {fld('rd-phone', 'Celular', <><PhoneInput id="rd-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />{!phoneOk && <p className="text-xs text-destructive">Informe DDD e número completos.</p>}</>)}
          {fld('rd-birth', 'Data de nascimento', <Input id="rd-birth" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} />)}
          {fld('rd-joined', 'Data de inscrição', <Input id="rd-joined" type="date" value={f.joined_at} onChange={(e) => setF({ ...f, joined_at: e.target.value })} />)}
        </div>
        {fld('rd-social-0', 'Redes sociais', <>
          {f.socials.map((v, i) => (
            <div key={i} className="flex gap-2">
              <Input id={`rd-social-${i}`} placeholder="@usuario" value={v} onChange={(e) => setF({ ...f, socials: f.socials.map((x, j) => (j === i ? e.target.value : x)) })} />
              {f.socials.length > 1 && <Button type="button" variant="ghost" size="sm" aria-label="Remover rede social" onClick={() => setF({ ...f, socials: f.socials.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, socials: [...f.socials, ''] })}><Plus className="h-4 w-4" /> Adicionar rede social</Button>
        </>)}
        {fld('rd-aff', 'Relação com a Grande Tijuca', <textarea id="rd-aff" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.affective_relation} onChange={(e) => setF({ ...f, affective_relation: e.target.value })} />)}
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.played_other_blocks} onChange={(e) => setF({ ...f, played_other_blocks: e.target.checked })} /> Toca ou já tocou com outros blocos</label>
        {f.played_other_blocks && fld('rd-other', 'Quais blocos?', <Input id="rd-other" value={f.other_blocks} onChange={(e) => setF({ ...f, other_blocks: e.target.value })} />)}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!phoneOk || save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}

export function MemberDetailSheet({ member, category, onChanged = () => {} }: { member: MemberRow; category?: string; onChanged?: (p: Partial<MemberRow>) => void }) {
  const canManage = usePermission('members.manage')
  const canSensitive = usePermission('members.sensitive.read')
  return (
    <SheetContent title={shortName(member.full_name, member.display_name)} titleExtra={category} description={ageOf(member.birth_date) === null ? member.full_name : `${member.full_name} (${ageOf(member.birth_date)} anos)`} className="w-full rounded-none border-0 p-2 shadow-none md:p-2">
      <ContactLinks member={member} />
      <MemberRole memberId={member.id} />
      {canManage && <RegistrationEditor key={member.id} member={member} onChanged={onChanged} />}
      <MemberSection title="Participação">
        <div className="space-y-3">
          <ArtisticLinks memberId={member.id} />
          <ArtisticLinks memberId={member.id} mode="collab" />
          <CycleParticipation memberId={member.id} />
        </div>
      </MemberSection>
      <MemberBilling memberId={member.id} />
      {canSensitive && <MemberSection collapsible title="Dados sensíveis"><MySensitiveData memberId={member.id} admin /></MemberSection>}
    </SheetContent>
  )
}
