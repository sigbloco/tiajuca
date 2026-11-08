import { useUnsaved } from '@/core/unsaved'
import { socialUrl } from '@/core/social'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { maskPhone, PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDate, formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { supabase } from '@/core/supabase'

interface Me {
  full_name: string; display_name: string | null; email: string | null; phone: string | null; social_handle: string | null
  birth_date: string | null; joined_at: string | null; affective_relation: string | null; played_other_blocks: boolean; other_blocks: string | null
}

const toList = (v: string | null) => { const l = (v ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return l.length ? l : [''] }

/** Dados cadastrais do próprio integrante: tudo editável, exceto a data de inscrição. Redes sociais: várias, uma por linha. */
export function MyData({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('full_name, display_name, email, phone, social_handle, birth_date, joined_at, affective_relation, played_other_blocks, other_blocks').eq('id', memberId).single()
      if (error) throw error
      return data as Me
    },
  })
  const [f, setF] = useState({ full_name: '', email: '', birth_date: '', display_name: '', phone: '', socials: [''], affective_relation: '', played_other_blocks: false, other_blocks: '' })
  useEffect(() => {
    const d = me.data
    if (d) setF({ full_name: d.full_name, email: d.email ?? '', birth_date: d.birth_date ?? '', display_name: d.display_name ?? '', phone: d.phone ? maskPhone(d.phone) : '', socials: toList(d.social_handle), affective_relation: d.affective_relation ?? '',
      played_other_blocks: d.played_other_blocks, other_blocks: d.other_blocks ?? '' })
  }, [me.data])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_my_profile', {
        p_member: memberId,
        p_patch: {
          full_name: f.full_name, email: f.email, birth_date: f.birth_date, display_name: f.display_name, phone: f.phone.replace(/\D/g, ''),
          social_handle: f.socials.map((x) => socialUrl(x)).filter(Boolean).join('\n'), affective_relation: f.affective_relation,
          played_other_blocks: f.played_other_blocks, other_blocks: f.played_other_blocks ? f.other_blocks : '',
        },
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Seus dados foram atualizados.'); qc.invalidateQueries({ queryKey: ['me', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['memberships'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const baseline = me.data ? JSON.stringify({ full_name: me.data.full_name, email: me.data.email ?? '', birth_date: me.data.birth_date ?? '', display_name: me.data.display_name ?? '', phone: me.data.phone ? maskPhone(me.data.phone) : '', socials: toList(me.data.social_handle), affective_relation: me.data.affective_relation ?? '', played_other_blocks: me.data.played_other_blocks, other_blocks: me.data.other_blocks ?? '' }) : ''
  useUnsaved(!!me.data && JSON.stringify(f) !== baseline, () => save.mutateAsync())
  if (me.isLoading || !me.data) return <Skeleton className="h-40" />
  const d = me.data
  const phoneDigits = f.phone.replace(/\D/g, '')
  const phoneOk = phoneDigits === '' || (phoneDigits.length >= 10 && phoneDigits.length <= 13)
  return (
    <Card className="space-y-3 p-4">
      <h3>Meus dados</h3>
      <p className="text-sm text-muted-foreground">Inscrição em <strong>{formatDate(d.joined_at)}</strong> (não pode ser alterada).</p>
      <form onSubmit={(e) => { e.preventDefault(); if (phoneOk) save.mutate() }} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="my-full">Nome completo</Label><Input id="my-full" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="my-email">E-mail</Label><Input id="my-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="my-birth">Data de nascimento</Label><Input id="my-birth" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="my-display">Como prefere ser chamado(a)</Label><Input id="my-display" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="my-phone">Celular</Label><PhoneInput id="my-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            {!phoneOk && <p className="text-xs text-destructive">Informe DDD e número completos.</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="my-social-0">Redes sociais</Label>
            {f.socials.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input id={`my-social-${i}`} placeholder="@usuario" value={v} onChange={(e) => setF({ ...f, socials: f.socials.map((x, j) => (j === i ? e.target.value : x)) })} />
                {f.socials.length > 1 && <Button type="button" variant="ghost" size="sm" aria-label="Remover rede social" onClick={() => setF({ ...f, socials: f.socials.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, socials: [...f.socials, ''] })}><Plus className="h-4 w-4" /> Adicionar rede social</Button></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="my-aff">Qual é a sua relação com a Grande Tijuca?</Label>
          <textarea id="my-aff" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.affective_relation} onChange={(e) => setF({ ...f, affective_relation: e.target.value })} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.played_other_blocks} onChange={(e) => setF({ ...f, played_other_blocks: e.target.checked })} /> Toco ou já toquei com outros blocos</label>
        {f.played_other_blocks && <div className="space-y-1.5"><Label htmlFor="my-other">Quais blocos?</Label><Input id="my-other" value={f.other_blocks} onChange={(e) => setF({ ...f, other_blocks: e.target.value })} /></div>}
        <Button type="submit" disabled={!phoneOk || save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar meus dados'}</Button>
      </form>
    </Card>
  )
}

const GENDERS = [['feminino', 'Feminino'], ['masculino', 'Masculino'], ['nao_binario', 'Não-binário'], ['outro', 'Outro'], ['prefiro_nao_informar', 'Prefiro não informar']]
const RACES = [['branca', 'Branca'], ['preta', 'Preta'], ['parda', 'Parda'], ['amarela', 'Amarela'], ['indigena', 'Indígena'], ['prefiro_nao_informar', 'Prefiro não informar']]
/** Opções da lista + o valor já gravado quando vem de outra grafia (ex.: "Mulher", "Branca" da planilha importada). */
const withCurrent = (opts: string[][], current: string) => [
  ...opts.map(([v, l]) => <option key={v} value={v}>{l}</option>),
  ...(current && !opts.some(([v]) => v === current) ? [<option key={current} value={current}>{current}</option>] : []),
]
const tri = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')
const fromTri = (v: string) => (v === '' ? null : v === 'yes')

/** Dados pessoais sensíveis (LGPD): opcionais; só o titular e a Direção veem; nunca em listas, chamadas, financeiro ou painéis. */
export function MySensitiveData({ memberId, admin = false }: { memberId: string; /** Visão da Direção na ficha do integrante: sem moldura/título (fica numa seção recolhível). */ admin?: boolean }) {
  const orgId = useOrgId()
  useEffect(() => { if (admin) void supabase.rpc('log_sensitive_access', { p_member: memberId }) }, [admin, memberId])
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const open = true
  const row = useQuery({
    queryKey: ['my-sensitive', orgId, memberId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_sensitive_data').select('gender, is_trans, race_color, is_pcd, pcd_description').eq('member_id', memberId).maybeSingle()
      if (error) throw error
      return data as { gender: string | null; is_trans: boolean | null; race_color: string | null; is_pcd: boolean | null; pcd_description: string | null } | null
    },
  })
  const consents = useQuery({
    queryKey: ['my-consents', orgId, memberId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('consent_records').select('id, purpose, granted_at, revoked_at').eq('member_id', memberId).order('granted_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; purpose: string; granted_at: string; revoked_at: string | null }[]
    },
  })
  const [f, setF] = useState({ gender: '', is_trans: '', race_color: '', is_pcd: '', pcd_description: '' })
  useEffect(() => {
    if (row.isSuccess) setF({ gender: row.data?.gender ?? '', is_trans: tri(row.data?.is_trans ?? null), race_color: row.data?.race_color ?? '', is_pcd: tri(row.data?.is_pcd ?? null), pcd_description: row.data?.pcd_description ?? '' })
  }, [row.isSuccess, row.data])

  const save = useMutation({
    mutationFn: async (clear: boolean) => {
      const pcd = clear ? null : fromTri(f.is_pcd)
      const payload = clear
        ? { gender: null, is_trans: null, race_color: null, is_pcd: null, pcd_description: null }
        : { gender: f.gender || null, is_trans: fromTri(f.is_trans), race_color: f.race_color || null, is_pcd: pcd, pcd_description: pcd ? (f.pcd_description.trim() || null) : null }
      const { error } = await supabase.from('member_sensitive_data').upsert({ member_id: memberId, organization_id: orgId, ...payload }, { onConflict: 'member_id' })
      if (error) throw error
      return clear
    },
    onSuccess: (clear) => { toast.success(clear ? 'Seus dados sensíveis foram apagados.' : 'Dados sensíveis salvos.'); qc.invalidateQueries({ queryKey: ['my-sensitive', orgId, memberId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const Wrap = admin ? 'div' : Card
  return (
    <Wrap className={admin ? 'space-y-3' : 'space-y-3 p-4'}>
      {!admin && <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2"><Lock className="h-4 w-4" /> Dados pessoais sensíveis</h3>
      </div>}
      <p className="text-muted-foreground">{admin
        ? <>Opcionais (LGPD). Só a própria pessoa e a Direção enxergam; cada consulta fica registrada na auditoria.</>
        : <>Gênero, cor/raça e deficiência são <strong>opcionais</strong>. Só você e a Direção de {membership?.short_name} enxergam. Não aparecem em listas, chamadas, financeiro, relatórios nem painéis.</>}</p>
      {open && (
        <>
          {row.isLoading ? <Skeleton className="h-24" /> : (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(false) }} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="s-gender">Gênero</Label>
                  <Select id="s-gender" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Não informar</option>{withCurrent(GENDERS, f.gender)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-race">Cor/raça</Label>
                  <Select id="s-race" value={f.race_color} onChange={(e) => setF({ ...f, race_color: e.target.value })}><option value="">Não informar</option>{withCurrent(RACES, f.race_color)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-trans">Você se considera trans?</Label>
                  <Select id="s-trans" value={f.is_trans} onChange={(e) => setF({ ...f, is_trans: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-pcd">É PCD (pessoa com deficiência)?</Label>
                  <Select id="s-pcd" value={f.is_pcd} onChange={(e) => setF({ ...f, is_pcd: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
              </div>
              {f.is_pcd === 'yes' && <div className="space-y-1.5"><Label htmlFor="s-pcd-d">Qual?</Label><Input id="s-pcd-d" value={f.pcd_description} onChange={(e) => setF({ ...f, pcd_description: e.target.value })} /></div>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
                <Button type="button" variant="ghost" className="text-destructive" disabled={save.isPending}
                  onClick={() => { if (window.confirm(admin ? 'Apagar todos os dados sensíveis desta pessoa?' : 'Apagar todos os seus dados sensíveis? Você poderá preenchê-los de novo quando quiser.')) { setF({ gender: '', is_trans: '', race_color: '', is_pcd: '', pcd_description: '' }); save.mutate(true) } }}>
                  {admin ? 'Apagar dados sensíveis' : 'Apagar meus dados sensíveis'}
                </Button>
              </div>
            </form>
          )}
          {(consents.data?.length ?? 0) > 0 && (
            <section className="space-y-1 border-t border-border pt-3">
              <h3 className="text-sm">Consentimentos registrados</h3>
              {consents.data!.map((c) => (
                <p key={c.id} className="flex items-center justify-between text-muted-foreground"><span>{c.purpose === 'inscricao' ? 'Inscrição' : c.purpose} · {formatDateTime(c.granted_at, membership?.timezone)}</span>
                  <Badge>{c.revoked_at ? 'Revogado' : 'Ativo'}</Badge></p>
              ))}
            </section>
          )}
          {!admin && <p className="text-xs text-muted-foreground">Para corrigir dados cadastrais travados, excluir seu cadastro ou revogar consentimentos, fale com a Direção.</p>}
        </>
      )}
    </Wrap>
  )
}
