import { socialLabel, socialUrl } from '@/core/social'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
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

/** Dados cadastrais do próprio integrante. Campos administrativos (nome completo, e-mail, nascimento) ficam só leitura. */
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
  const [f, setF] = useState({ display_name: '', phone: '', social_handle: '', affective_relation: '', played_other_blocks: false, other_blocks: '' })
  useEffect(() => {
    const d = me.data
    if (d) setF({ display_name: d.display_name ?? '', phone: d.phone ? maskPhone(d.phone) : '', social_handle: d.social_handle ?? '', affective_relation: d.affective_relation ?? '',
      played_other_blocks: d.played_other_blocks, other_blocks: d.other_blocks ?? '' })
  }, [me.data])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_my_profile', {
        p_member: memberId,
        p_patch: {
          display_name: f.display_name, phone: f.phone.replace(/\D/g, ''), social_handle: socialUrl(f.social_handle) ?? '', affective_relation: f.affective_relation,
          played_other_blocks: f.played_other_blocks, other_blocks: f.played_other_blocks ? f.other_blocks : '',
        },
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Seus dados foram atualizados.'); qc.invalidateQueries({ queryKey: ['me', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['memberships'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  if (me.isLoading || !me.data) return <Skeleton className="h-40" />
  const d = me.data
  const phoneDigits = f.phone.replace(/\D/g, '')
  const phoneOk = phoneDigits === '' || (phoneDigits.length >= 10 && phoneDigits.length <= 13)
  return (
    <Card className="space-y-3 p-4">
      <h3>Meus dados</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Nome completo</dt><dd className="font-semibold">{d.full_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="font-semibold">{d.email ?? '—'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Data de nascimento</dt><dd className="font-semibold">{formatDate(d.birth_date)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Inscrição</dt><dd className="font-semibold">{formatDate(d.joined_at)}</dd></div>
      </dl>
      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Nome completo, e-mail e data de nascimento só a Direção altera. Se algo estiver errado, fale com ela.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (phoneOk) save.mutate() }} className="space-y-3 border-t border-border pt-3">
        <div className="space-y-1.5"><Label htmlFor="my-display">Como prefere ser chamado(a)</Label><Input id="my-display" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="my-phone">Celular</Label><PhoneInput id="my-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            {!phoneOk && <p className="text-xs text-destructive">Informe DDD e número completos.</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="my-social">Rede social</Label><Input id="my-social" placeholder="@usuario" value={f.social_handle} onChange={(e) => setF({ ...f, social_handle: e.target.value })} />
            {socialUrl(f.social_handle) && <a className="text-xs text-primary underline" href={socialUrl(f.social_handle)!} target="_blank" rel="noreferrer noopener">Abrir {socialLabel(socialUrl(f.social_handle)!)}</a>}</div>
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
const tri = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')
const fromTri = (v: string) => (v === '' ? null : v === 'yes')

/** Dados pessoais sensíveis (LGPD): opcionais; só o titular e a Direção veem; nunca em listas, chamadas, financeiro ou painéis. */
export function MySensitiveData({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
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

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2"><Lock className="h-4 w-4" /> Dados pessoais sensíveis</h3>
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Ver e editar'}</Button>
      </div>
      <p className="text-muted-foreground">Gênero, cor/raça e deficiência são <strong>opcionais</strong>. Só você e a Direção de {membership?.short_name} enxergam. Não aparecem em listas, chamadas, financeiro, relatórios nem painéis.</p>
      {open && (
        <>
          {row.isLoading ? <Skeleton className="h-24" /> : (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(false) }} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="s-gender">Gênero</Label>
                  <Select id="s-gender" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Não informar</option>{GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-race">Cor/raça</Label>
                  <Select id="s-race" value={f.race_color} onChange={(e) => setF({ ...f, race_color: e.target.value })}><option value="">Não informar</option>{RACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-trans">Você se considera trans?</Label>
                  <Select id="s-trans" value={f.is_trans} onChange={(e) => setF({ ...f, is_trans: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-pcd">É PCD (pessoa com deficiência)?</Label>
                  <Select id="s-pcd" value={f.is_pcd} onChange={(e) => setF({ ...f, is_pcd: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
              </div>
              {f.is_pcd === 'yes' && <div className="space-y-1.5"><Label htmlFor="s-pcd-d">Qual?</Label><Input id="s-pcd-d" value={f.pcd_description} onChange={(e) => setF({ ...f, pcd_description: e.target.value })} /></div>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={save.isPending}>Salvar</Button>
                <Button type="button" variant="ghost" className="text-destructive" disabled={save.isPending}
                  onClick={() => { if (window.confirm('Apagar todos os seus dados sensíveis? Você poderá preenchê-los de novo quando quiser.')) { setF({ gender: '', is_trans: '', race_color: '', is_pcd: '', pcd_description: '' }); save.mutate(true) } }}>
                  Apagar meus dados sensíveis
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
          <p className="text-xs text-muted-foreground">Para corrigir dados cadastrais travados, excluir seu cadastro ou revogar consentimentos, fale com a Direção.</p>
        </>
      )}
    </Card>
  )
}
