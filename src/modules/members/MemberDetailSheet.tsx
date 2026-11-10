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
import { Cake, Globe, Mail, Pencil, Plus, Save, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Input, Label, Select, SheetContent, Skeleton } from '@/components/ui/primitives'
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
import { MySensitiveData } from '@/modules/profile/MyData'
import { ArtisticLinks } from './ArtisticLinks'
import { InstagramIcon, MemberSection, WhatsAppIcon } from './MemberSection'
import { useSelectedCycle } from '@/modules/cycles/SelectedCycle'
import type { MemberRow } from './service'

type CycleLite = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean }

/** Participação (artística, colaborativa, remunerada) e contribuição de um ciclo. Sem ciclo: o que vale hoje. */
function ParticipationBlock({ memberId, cycle }: { memberId: string; cycle?: CycleLite }) {
  return (
    <div className="space-y-3 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-3">
      <MemberSection title="Participação">
        <div className="space-y-3">
          <ArtisticLinks memberId={memberId} cycle={cycle} />
          <ArtisticLinks memberId={memberId} mode="collab" cycle={cycle} />
          <ArtisticLinks memberId={memberId} mode="paid" cycle={cycle} />
        </div>
      </MemberSection>
      <MemberBilling memberId={memberId} cycle={cycle} />
    </div>
  )
}

/** Ao entrar num ciclo que não é o atual, começa com a participação, a categoria e a bolsa do ciclo anterior em que a pessoa tinha registro. Devolve o nome do ciclo copiado. */
async function copyFromPrevious(orgId: string, memberId: string, target: CycleLite, all: CycleLite[]): Promise<string | null> {
  const has = await supabase.from('cycle_participations').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('cycle_id', target.id)
  const hasFee = await supabase.from('cycle_fee_assignments').select('id', { count: 'exact', head: true }).eq('member_id', memberId).eq('cycle_id', target.id)
  if ((has.count ?? 0) > 0 || (hasFee.count ?? 0) > 0) return null
  const prevs = all.filter((c) => c.starts_on < target.starts_on).sort((a, b) => b.starts_on.localeCompare(a.starts_on))
  for (const prev of prevs) {
    const parts = await supabase.from('cycle_participations').select('instrument_id, function_id, skill_level_id, is_student, is_paid, is_primary').eq('member_id', memberId).eq('cycle_id', prev.id)
    const fee = await supabase.from('cycle_fee_assignments').select('fee_category_id').eq('member_id', memberId).eq('cycle_id', prev.id).maybeSingle()
    const sch = await supabase.from('cycle_scholarships').select('percent, reason, scholarship_type_id').eq('member_id', memberId).eq('cycle_id', prev.id).maybeSingle()
    if (parts.error) throw parts.error
    if (!parts.data?.length && !fee.data) continue
    const base = { organization_id: orgId, member_id: memberId, cycle_id: target.id }
    if (parts.data?.length) { const { error } = await supabase.from('cycle_participations').insert(parts.data.map((x) => ({ ...base, ...x }))); if (error) throw error }
    if (fee.data) { const { error } = await supabase.from('cycle_fee_assignments').insert({ ...base, fee_category_id: (fee.data as { fee_category_id: string }).fee_category_id }); if (error) throw error }
    if (sch.data) { const { error } = await supabase.from('cycle_scholarships').insert({ ...base, ...(sch.data as object) }); if (error) throw error }
    return prev.name
  }
  return null
}

/** Um ciclo da pessoa: situação, e como filhos a participação e a contribuição daquele ciclo. */
function CycleGroup({ cycle, status, memberId, canManage, onChange, statuses, selector }: {
  selector?: ReactNode
  cycle: CycleLite; status?: { key: string; name: string; counts_as_active: boolean; is_waitlist: boolean }; memberId: string; canManage: boolean
  onChange: (cycle: string, status: string) => Promise<unknown>
  statuses: { id: string; key: string; name: string; counts_as_active: boolean; is_waitlist: boolean }[]
}) {
  const past = isPastCycle(cycle)
  // Ciclo que já passou: "Participou" / "Não participou"; Ativo/Inativo é só do ciclo atual.
  const optionsFor = past ? statuses.filter((x) => !x.is_waitlist) : statuses
  const labelOf = (x: { name: string; counts_as_active: boolean; is_waitlist: boolean }) => (past && !x.is_waitlist ? (x.counts_as_active ? 'Participou' : 'Não participou') : x.name)
  return (
    <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 gap-2">
          {selector && <div className="min-w-0 space-y-1"><Label className="text-xs">Ciclo</Label>{selector}</div>}
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Situação</Label>
            <OkSelect className="w-full min-w-0" disabled={!canManage} value={status?.key ?? ''} onSave={(v) => onChange(cycle.id, v)} aria-label={'Situação em ' + cycle.name}>
              {!status && <option value="">Sem registro</option>}
              {status && past && status.is_waitlist && <option value={status.key}>{status.name}</option>}
              {optionsFor.map((x) => <option key={x.id} value={x.key}>{labelOf(x)}</option>)}
            </OkSelect>
          </div>
        </div>
        <div className="border-t border-border pt-3"><ParticipationBlock memberId={memberId} cycle={cycle} /></div>
    </div>
  )
}

/** Ciclos da pessoa em ordem cronológica, cada um um grupo com seus filhos. Sem nenhum ciclo, a participação e a contribuição ficam soltas (nada se perde). */
function CyclesSection({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const { data: cycles } = useCycles()
  const { data: statuses } = useCycleStatuses()
  const canManage = usePermission('member_cycles.manage', 'group')
  const canForce = usePermission('capacity.manage')
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const { cycleId: globalCycle } = useSelectedCycle()

  const { data: rows, isLoading } = useQuery({
    queryKey: ['member-cycles', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_cycles').select('cycle_id, status_id').eq('member_id', memberId)
      if (error) throw error
      return data as { cycle_id: string; status_id: string }[]
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['member-cycles', orgId, memberId] })
    qc.invalidateQueries({ queryKey: ['capacity', orgId] })
    qc.invalidateQueries({ queryKey: ['members'] })
  }
  const statusOfCycle = (cycleId: string) => statuses?.find((x) => x.id === rows?.find((r) => r.cycle_id === cycleId)?.status_id)

  const change = useMutation({
    mutationFn: (v: { cycle: string; status: string; force?: boolean }) => setMemberCycleStatus({ member: memberId, ...v }),
    onSuccess: (_d, v) => {
      const before = statuses?.find((x) => x.id === rows?.find((r) => r.cycle_id === v.cycle)?.status_id)?.key
      refresh()
      notifyChange('Status atualizado.', before ? async () => { await setMemberCycleStatus({ member: memberId, cycle: v.cycle, status: before, force: true }); refresh() } : undefined)
    },
    onError: (e, v) => {
      const msg = friendlyError(e)
      if (canForce && /lotado/i.test(msg) && !v.force) toast.error(msg, { action: { label: 'Autorizar exceção', onClick: () => change.mutate({ ...v, force: true }) } })
      else toast.error(msg)
    },
  })
  const add = useMutation({
    mutationFn: async (cycleId: string) => {
      await setMemberCycleStatus({ member: memberId, cycle: cycleId, status: 'active' })
      const target = (cycles ?? []).find((c) => c.id === cycleId)
      return target && !target.is_current ? copyFromPrevious(orgId, memberId, target, cycles ?? []) : null
    },
    onSuccess: (copied) => {
      refresh()
      qc.invalidateQueries({ queryKey: ['member-links', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['cycle-billing', orgId, memberId] })
      toast.success(copied ? 'Ciclo adicionado, com a participação e a contribuição copiadas de ' + copied + '.' : 'Ciclo adicionado.')
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const mine = (cycles ?? []).filter((c) => c.is_active && rows?.some((x) => x.cycle_id === c.id)).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  // Um ciclo por vez, escolhido no menu: o do menu fixo (se a pessoa participa dele), senão o mais recente.
  const chosen = mine.find((c) => c.id === pick) ?? mine.find((c) => c.id === globalCycle) ?? mine[mine.length - 1]
  const missing = (cycles ?? []).filter((c) => c.is_active && !rows?.some((x) => x.cycle_id === c.id)).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  return (
    <div className="space-y-3">
      <MemberSection title={<span className="inline-flex items-center gap-1.5">Ciclos{canManage && !adding && missing.length > 0 && (
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted" aria-label="Adicionar ciclo" title="Adicionar ciclo" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /></button>
      )}</span>}>
        {isLoading && <Skeleton className="h-16" />}
        {adding && (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
            <Select aria-label="Ciclo" defaultValue="" onChange={(e) => { if (e.target.value) { add.mutate(e.target.value); setAdding(false) } }}>
              <option value="">Escolha o ciclo</option>
              {missing.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /></Button>
          </div>
        )}
        {mine.length === 0 && !isLoading && <p className="px-1 text-sm text-muted-foreground">Sem ciclos. A participação e a contribuição ficam abaixo, sem vínculo com ciclo.</p>}
        {(chosen ? [chosen] : []).map((c) => (
          <CycleGroup key={c.id} cycle={c} selector={
            <Select aria-label="Ciclo" value={chosen?.id ?? ''} onChange={(e) => setPick(e.target.value)}>
              {mine.map((m) => <option key={m.id} value={m.id}>{m.name}{m.is_current ? ' · atual' : ''}</option>)}
            </Select>} status={statusOfCycle(c.id)} memberId={memberId} canManage={canManage} statuses={statuses ?? []}
            onChange={(cycle, status) => change.mutateAsync({ cycle, status })} />
        ))}
      </MemberSection>
      {!isLoading && mine.length === 0 && <ParticipationBlock memberId={memberId} />}
    </div>
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
function RegistrationEditor({ member, onChanged, open, setOpen }: { member: MemberRow; onChanged: (p: Partial<MemberRow>) => void; open: boolean; setOpen: (v: boolean) => void }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
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
        played_other_blocks: !!nn(f.other_blocks), other_blocks: nn(f.other_blocks),
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

  if (!open) return null
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
        {fld('rd-other', 'Outros blocos', <Input id="rd-other" value={f.other_blocks} onChange={(e) => setF({ ...f, other_blocks: e.target.value })} />)}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!phoneOk || save.isPending} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Cancelar" title="Cancelar"><X className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  )
}

const Blank = () => <span className="text-xs italic text-muted-foreground/70">em branco</span>

/** Respostas da inscrição: relação com a Grande Tijuca e se já tocou com outros blocos. Em branco quando não há resposta. */
function RelationWithBlock({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const { cycle } = useSelectedCycle()
  const [more, setMore] = useState(false)
  const field = useQuery({
    queryKey: ['member-relation', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('affective_relation, other_blocks').eq('id', memberId).single()
      if (error) throw error
      return data as { affective_relation: string | null; other_blocks: string | null }
    },
  })
  const answers = useQuery({
    queryKey: ['member-form-answers', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('member_form_answers').select('id, cycle_id, cycle_label, affective_relation, other_blocks, created_at').eq('member_id', memberId)
      if (error) throw error
      return (data ?? []) as { id: string; cycle_id: string | null; cycle_label: string; affective_relation: string | null; other_blocks: string | null; created_at: string }[]
    },
  })
  // Mais recente primeiro (por rótulo do ciclo e, no mesmo ciclo, pela inscrição mais nova).
  const rows = [...(answers.data ?? [])].sort((x, y) => y.cycle_label.localeCompare(x.cycle_label, 'pt-BR') || y.created_at.localeCompare(x.created_at))
  const isCurrent = (r: { cycle_id: string | null }) => !!cycle && r.cycle_id === cycle.id
  const section = (title: string, key: 'affective_relation' | 'other_blocks', fixed: string | null | undefined) => {
    const list = rows.filter((r) => !!r[key]?.trim())
    const shown = more ? list : list.filter(isCurrent)
    const visible = !more && shown.length === 0 && list.length > 0 ? [] : shown // sem resposta no ciclo atual: nada até "Ler mais"
    return (
      <div className="space-y-0.5">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {list.length === 0 && <p className="min-h-5 whitespace-pre-wrap text-sm">{fixed?.trim() || (field.data ? <Blank /> : '')}</p>}
        {visible.map((r) => <p key={r.id} className="whitespace-pre-wrap text-sm"><span className="font-semibold">{r.cycle_label}:</span> {r[key]}</p>)}
        {list.length > 0 && visible.length === 0 && <p className="text-sm text-muted-foreground">Sem resposta neste ciclo.</p>}
      </div>
    )
  }
  const hasOlder = rows.some((r) => !isCurrent(r) && (r.affective_relation?.trim() || r.other_blocks?.trim()))
  return (
    <section className="space-y-3 border-t border-border pt-3">
      {section('Relação com a Grande Tijuca', 'affective_relation', field.data?.affective_relation)}
      {section('Outros blocos', 'other_blocks', field.data?.other_blocks)}
      {hasOlder && (
        <button type="button" className="font-semibold text-primary hover:underline" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Ocultar' : 'Ler mais'}</button>
      )}
    </section>
  )
}

export function MemberDetailSheet({ member, category, onChanged = () => {} }: { member: MemberRow; category?: string; onChanged?: (p: Partial<MemberRow>) => void }) {
  const canManage = usePermission('members.manage')
  const canSensitive = usePermission('members.sensitive.read')
  const [editing, setEditing] = useState(false)
  void category
  return (
    <SheetContent title={shortName(member.full_name, member.display_name)} titleAction={canManage && (
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar dados" title="Editar dados" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
    )} description={ageOf(member.birth_date) === null ? member.full_name : `${member.full_name} (${ageOf(member.birth_date)} anos)`} className="w-full rounded-none border-0 p-2 shadow-none md:p-2">
      <ContactLinks member={member} />
      {canSensitive && <MemberSection collapsible title="Dados sensíveis"><MySensitiveData memberId={member.id} admin /></MemberSection>}
      {canManage && <RegistrationEditor key={member.id} member={member} onChanged={onChanged} open={editing} setOpen={setEditing} />}
      <CyclesSection memberId={member.id} />
      <RelationWithBlock memberId={member.id} />
    </SheetContent>
  )
}
