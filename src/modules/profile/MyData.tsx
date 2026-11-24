import { requireFields } from '@/core/required'
import { SaveButton } from '@/components/shared/SaveButton'
import { StickySave } from '@/components/shared/StickySave'
import { ButtonRow } from '@/components/shared/ButtonRow'
import { ProgressiveList } from '@/components/shared/LoadMore'
import { confirmBox } from '@/components/shared/DialogHost'
import { useUnsaved } from '@/core/unsaved'
import { ReadMore } from '@/components/shared/ReadMore'
import { SOCIAL_NETWORKS, networkUrl, splitNetwork, type Network } from '@/core/social'
import { useSocialNetworks } from '@/modules/forms/socialNetworks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Lock, Plus, Save, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DateInput, maskPhone, PhoneInput } from '@/components/ui/masked-inputs'
import { Badge, Button, Card, Input, Label, Select, Skeleton, cn } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatDateTime } from '@/core/format'
import { useOrgId, useOrganization } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { supabase } from '@/core/supabase'
import { ExtraEmails } from '@/modules/members/ExtraEmails'
import { fetchSensitive, saveSensitive } from './sensitive'

interface Me {
  full_name: string; display_name: string | null; email: string | null; phone: string | null; social_handle: string | null
  birth_date: string | null; joined_at: string | null; affective_relation: string | null; played_other_blocks: boolean; other_blocks: string | null; played_instrument: string | null
}

const toList = (v: string | null) => { const l = (v ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); return l.length ? l : [''] }

/** A página do perfil tem um único botão Salvar: cada bloco registra aqui a sua função de salvar (devolve false se algo impede). */
export type SaveBinder = (fn: (() => Promise<boolean | void>) | null) => void
function useBindSave(bind: SaveBinder | undefined, fn: () => Promise<boolean | void>) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => { bind?.(() => ref.current()); return () => bind?.(null) }, [bind])
}

const NOT_APPLICABLE = 'Não se aplica'
const isNA = (v: string) => v.trim().toLowerCase() === 'não se aplica'
/** Botão que preenche "Não se aplica" (campo opcional respondido, some do aviso de perfil incompleto). */
function NotApplicable({ value, onSet }: { value: string; onSet: (v: string) => void }) {
  if (value.trim() !== '') return null
  return <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => onSet(NOT_APPLICABLE)}>Não se aplica</button>
}

const NL = String.fromCharCode(10)

/** Perfil do bloco: cada rede social é uma rede (menu) + o usuário; o link é montado sozinho. */
interface NetRow { network: string; user: string }
/** Marca de quem não tem/não usa redes sociais (o perfil deixa de pedir; o link é ignorado nas telas). */
const NO_SOCIAL = 'Não uso'
const isNoSocial = (t: string | null | undefined) => /^n[aã]o uso\.?$/i.test((t ?? '').trim())
const rowsOf = (t: string | null, nets: Network[] = SOCIAL_NETWORKS): NetRow[] => { const l = (t ?? '').split(NL).map((x) => x.trim()).filter((x) => Boolean(x) && !isNoSocial(x)); return l.length ? l.map((u) => splitNetwork(u, nets)) : [{ network: nets[0]?.key ?? 'instagram', user: '' }] }
const urlsOf = (rows: NetRow[], nets: Network[] = SOCIAL_NETWORKS) => rows.map((r) => networkUrl(r.network, r.user, nets)).filter((x): x is string => !!x)

/** Dados cadastrais do próprio integrante: tudo editável, exceto a data de inscrição. Redes sociais: várias, uma por linha. */
export function MyData({ memberId, bind, part = 'contact' }: { memberId: string; bind?: SaveBinder; /** `contact`: dados e contato. `other`: "Outras informações" (vai por último no perfil). */ part?: 'contact' | 'other' | 'bloco' }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me', orgId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase.from('members')
        .select('full_name, display_name, email, phone, social_handle, birth_date, joined_at, affective_relation, played_other_blocks, other_blocks, played_instrument').eq('id', memberId).single()
      if (error) throw error
      return data as Me
    },
  })
  const toF = (d: Me) => ({ full_name: d.full_name, email: d.email ?? '', birth_date: d.birth_date ?? '', display_name: d.display_name ?? '', phone: d.phone ? maskPhone(d.phone) : '', socials: toList(d.social_handle), affective_relation: d.affective_relation ?? '', other_blocks: d.other_blocks ?? '', played_instrument: d.played_instrument ?? '' })
  const [f, setF] = useState(() => toF({ full_name: '', display_name: null, email: null, phone: null, social_handle: null, birth_date: null, joined_at: null, affective_relation: null, played_other_blocks: false, other_blocks: null, played_instrument: null }))
  useEffect(() => { if (me.data) setF(toF(me.data)) }, [me.data])
  // Cada bloco só olha e grava os seus campos.
  const nets = useSocialNetworks()
  const [rows, setRows] = useState<NetRow[]>([{ network: 'instagram', user: '' }])
  // Redes como vieram do banco (lidas junto com `rows`, com as mesmas redes): é com elas que se compara, para não acusar alteração só porque a lista de redes carregou depois.
  const [baseRows, setBaseRows] = useState<NetRow[]>([{ network: 'instagram', user: '' }])
  // Data de fundação do bloco (perfil do bloco): aparece nos aniversários do Calendário.
  const founded = useQuery({
    queryKey: ['org-founded', orgId], enabled: part === 'bloco',
    queryFn: async () => { const { data, error } = await supabase.from('organizations').select('founded_on').eq('id', orgId).single(); if (error) throw error; return (data as { founded_on: string | null }).founded_on ?? '' },
  })
  const [foundedOn, setFoundedOn] = useState('')
  useEffect(() => { if (founded.data !== undefined) setFoundedOn(founded.data) }, [founded.data])
  const [noSocial, setNoSocial] = useState(false)
  const manageMembers = usePermission('members.manage')
  const { viewAs } = useOrganization()
  const linked = useQuery({
    queryKey: ['me-linked', orgId, memberId], enabled: part !== 'bloco',
    queryFn: async () => { const { data, error } = await supabase.from('members').select('user_id').eq('id', memberId).single(); if (error) throw error; return Boolean((data as { user_id: string | null }).user_id) },
  })
  useEffect(() => { if (me.data) { const r = rowsOf(me.data.social_handle, nets); setRows(r); setBaseRows(r); setNoSocial(isNoSocial(me.data.social_handle)) } }, [me.data])
  const OTHER = ['affective_relation', 'other_blocks', 'played_instrument'] as const
  const mine = (x: ReturnType<typeof toF>) => JSON.stringify(part === 'other' ? OTHER.map((k) => x[k]) : part === 'bloco' ? [x.email, x.phone, x.socials] : [x.full_name, x.email, x.birth_date, x.display_name, x.phone])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_my_profile', {
        p_member: memberId,
        p_patch: part === 'bloco'
          ? { email: f.email, phone: f.phone.replace(/[^0-9]/g, ''), social_handle: urlsOf(rows, nets).join(NL) }
          : part === 'other'
          ? { affective_relation: f.affective_relation, other_blocks: f.other_blocks, played_other_blocks: f.other_blocks.trim() !== '' && !isNA(f.other_blocks), played_instrument: f.played_instrument }
          : { full_name: f.full_name, email: f.email, birth_date: f.birth_date, display_name: f.display_name, phone: f.phone.replace(/\D/g, ''), social_handle: noSocial ? NO_SOCIAL : urlsOf(rows, nets).join(NL) },
      })
      if (error) throw error
      if (part === 'bloco' && foundedOn !== (founded.data ?? '')) { const r = await supabase.rpc('set_org_founded', { p_org: orgId, p_date: foundedOn || null }); if (r.error) throw r.error }
    },
    onSuccess: () => { toast.success('Seus dados foram atualizados.'); qc.invalidateQueries({ queryKey: ['org-founded', orgId] }); qc.invalidateQueries({ queryKey: ['birthdays', orgId] }); qc.invalidateQueries({ queryKey: ['me', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['me-head', orgId, memberId] }); qc.invalidateQueries({ queryKey: ['memberships'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const baseline = me.data ? (part === 'bloco' ? JSON.stringify([toF(me.data).email, toF(me.data).phone, baseRows, founded.data ?? '']) : mine(toF(me.data)) + (part === 'other' ? '' : JSON.stringify(baseRows) + String(isNoSocial(me.data.social_handle)))) : ''
  const curKey = part === 'bloco' ? JSON.stringify([f.email, f.phone, rows, foundedOn]) : mine(f) + (part === 'other' ? '' : JSON.stringify(rows) + String(noSocial))
  useUnsaved(!!me.data && curKey !== baseline, () => save.mutateAsync())
  const phoneDigits = f.phone.replace(/\D/g, '')
  const phoneOk = phoneDigits === '' || (phoneDigits.length >= 10 && phoneDigits.length <= 13)
  useBindSave(bind, async () => {
    if (!me.data || curKey === baseline) return
    if (part !== 'other' && !requireFields([['Telefone válido (DDD + número)', phoneOk]])) return false
    await save.mutateAsync()
  })
  if (me.isLoading || !me.data) return <Skeleton className="h-40" />
  if (part === 'bloco') {
    return (
      <Card className="space-y-3 p-4">
        <h3>Contatos do bloco</h3>
        <p className="text-sm text-muted-foreground">A Loja, o Site e os e-mails usam estes contatos, que ficam <strong>públicos</strong> (qualquer visitante vê). Prefira um e-mail e um WhatsApp do bloco aos seus pessoais.</p>
        <div className="space-y-1.5"><Label htmlFor="bl-email">E-mail de contato</Label><Input id="bl-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="bl-phone">WhatsApp</Label><PhoneInput id="bl-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          {!phoneOk && <p className="text-xs text-destructive">Informe DDD e número completos.</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="bl-founded">Data de fundação</Label><DateInput id="bl-founded" value={foundedOn} onChange={setFoundedOn} />
          <p className="text-xs text-muted-foreground">Aparece nos aniversários do Calendário.</p></div>
        <div className="space-y-1.5"><Label htmlFor="bl-user-0">Redes sociais</Label>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Select aria-label="Rede" className="w-36 shrink-0" value={r.network} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))}>
                {nets.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
              </Select>
              <Input id={`bl-user-${i}`} aria-label="Usuário" placeholder="usuário" value={r.user} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))} />
              {rows.length > 1 && <Button type="button" variant="ghost" size="sm" aria-label="Remover rede social" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setRows([...rows, { network: 'instagram', user: '' }])}><Plus className="h-4 w-4" /> Adicionar rede social</Button></div>
      </Card>
    )
  }
  if (part === 'other') {
    return (
      <Card className="space-y-3 p-4">
        <h3>Outras informações</h3>
        <div className="space-y-1.5"><Label htmlFor="my-instr">Toca ou já tocou algum instrumento?</Label><Input id="my-instr" value={f.played_instrument} onChange={(e) => setF({ ...f, played_instrument: e.target.value })} /><NotApplicable value={f.played_instrument} onSet={(v) => setF({ ...f, played_instrument: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="my-other">Toca ou já tocou com outros blocos?</Label><Input id="my-other" value={f.other_blocks} onChange={(e) => setF({ ...f, other_blocks: e.target.value })} /><NotApplicable value={f.other_blocks} onSet={(v) => setF({ ...f, other_blocks: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="my-aff">Qual é a sua relação com a Grande Tijuca?</Label>
          <textarea id="my-aff" rows={3} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.affective_relation} onChange={(e) => setF({ ...f, affective_relation: e.target.value })} /><NotApplicable value={f.affective_relation} onSet={(v) => setF({ ...f, affective_relation: v })} /></div>
      </Card>
    )
  }
  // E-mail do Google (gmail) é o que liga o login ao cadastro: trocar por conta própria quebraria o acesso.
  // Conta Google pode ter qualquer e-mail (não só gmail): vale estar vinculada a um login.
  // O principal é o e-mail da conta Google que entra no sistema: quem não gerencia não troca (pede por "Adicionais"). Vale para qualquer e-mail, não só gmail.
  const lockEmail = !manageMembers
  const showEmailNote = !manageMembers || !!viewAs || Boolean(linked.data)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (requireFields([['Telefone válido (DDD + número)', phoneOk]])) save.mutate() }} className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3>E-mail</h3>
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5"><Label htmlFor="my-email">Principal</Label>
            {showEmailNote && <span className="min-w-0 whitespace-nowrap text-[clamp(0.6rem,2.7vw,0.75rem)] text-muted-foreground">conta Google: só a direção altera</span>}</div>
          <Input id="my-email" type="email" value={f.email} disabled={lockEmail} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <ExtraEmails memberId={memberId} self />
      </Card>
      <Card className="space-y-3 p-4">
        <h3>Meus dados</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="order-1 space-y-1.5"><Label htmlFor="my-full" required>Nome completo</Label><Input id="my-full" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="order-2 space-y-1.5"><Label htmlFor="my-display">Como prefere ser chamado(a)</Label><Input id="my-display" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></div>
          <div className="order-3 space-y-1.5"><Label htmlFor="my-phone">Celular</Label><PhoneInput id="my-phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            {!phoneOk && <p className="text-xs text-destructive">Informe DDD e número completos.</p>}</div>
          <div className="order-4 space-y-1.5 sm:order-5 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Label htmlFor="my-user-0">Redes sociais</Label>
              <button type="button" className="tap-44 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50" aria-label="Adicionar rede social" title="Adicionar rede social" disabled={noSocial}
                onClick={() => setRows([...rows, { network: 'instagram', user: '' }])}><Plus className="h-3.5 w-3.5" /></button>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><input type="checkbox" className="h-4 w-4" checked={noSocial} onChange={(e) => setNoSocial(e.target.checked)} /> não tenho / não uso</label>
            </div>
            {rows.map((r, i) => (
              <div key={i} className={cn('flex gap-2', noSocial && 'opacity-50')}>
                <Select aria-label="Rede" className="w-36 shrink-0" disabled={noSocial} value={r.network} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)))}>
                  {nets.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
                </Select>
                <Input id={`my-user-${i}`} aria-label="Usuário" placeholder="usuário" disabled={noSocial} value={r.user} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, user: e.target.value } : x)))} />
                {rows.length > 1 && <Button type="button" variant="ghost" size="sm" aria-label="Remover rede social" disabled={noSocial} onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
          <div className="order-5 space-y-1.5 sm:order-4"><Label htmlFor="my-birth">Data de nascimento</Label><Input id="my-birth" type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
        </div>
      </Card>
      {!bind && <StickySave><SaveButton type="submit" className="w-full" disabled={save.isPending} hint="Salvar meus dados" /></StickySave>}
    </form>
  )
}

const GENDERS = [['Homem', 'Homem'], ['Mulher', 'Mulher'], ['Pessoa não binária', 'Pessoa não binária'], ['Outro', 'Outro']]
const RACES = [['branca', 'Branca'], ['preta', 'Preta'], ['parda', 'Parda'], ['amarela', 'Amarela'], ['indigena', 'Indígena'], ['prefiro_nao_informar', 'Prefiro não informar']]
/** Opções da lista + o valor já gravado quando vem de outra grafia (ex.: "Mulher", "Branca" da planilha importada). */
const withCurrent = (opts: string[][], current: string) => [
  ...opts.map(([v, l]) => <option key={v} value={v}>{l}</option>),
  ...(current && !opts.some(([v]) => v === current) ? [<option key={current} value={current}>{current}</option>] : []),
]
const tri = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')
const fromTri = (v: string) => (v === '' ? null : v === 'yes')

/** Dados pessoais sensíveis (LGPD): opcionais; só o titular e a direção veem; nunca em listas, chamadas, financeiro ou painéis. */
export function MySensitiveData({ memberId, admin = false, readOnly = false, bind }: { memberId: string; /** Sem botão próprio de salvar: quem salva é o botão único da página. */ bind?: SaveBinder; /** Só leitura: os campos ficam travados até a pessoa clicar no lápis de editar. */ readOnly?: boolean; /** Visão da Direção na ficha do integrante: sem moldura/título (fica numa seção recolhível). */ admin?: boolean }) {
  const orgId = useOrgId()
  // A leitura de outra pessoa é registrada pelo próprio banco (get_member_sensitive).
  const { membership } = useOrganization()
  const qc = useQueryClient()
  const open = true
  // No próprio perfil a seção começa recolhida (os dados carregam do mesmo jeito, para o Salvar da página funcionar).
  const [shown, setShown] = useState(admin)
  const row = useQuery({
    queryKey: ['my-sensitive', orgId, memberId],
    enabled: open,
    queryFn: () => fetchSensitive(memberId),
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
      await saveSensitive(memberId, payload)
      return clear
    },
    onSuccess: (clear) => { toast.success(clear ? 'Seus dados sensíveis foram apagados.' : 'Dados sensíveis salvos.'); qc.invalidateQueries({ queryKey: ['my-sensitive', orgId, memberId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const sensBaseline = JSON.stringify({ gender: row.data?.gender ?? '', is_trans: tri(row.data?.is_trans ?? null), race_color: row.data?.race_color ?? '', is_pcd: tri(row.data?.is_pcd ?? null), pcd_description: row.data?.pcd_description ?? '' })
  useBindSave(bind, async () => {
    if (!row.isSuccess || JSON.stringify(f) === sensBaseline) return
    await save.mutateAsync(false)
  })
  const Wrap = admin ? 'div' : Card
  return (
    <Wrap className={admin ? 'space-y-3' : 'space-y-3 p-4'}>
      {!admin && (
        <button type="button" aria-expanded={shown} className="flex w-full items-center gap-2 text-left" onClick={() => setShown((v) => !v)}>
          <ChevronRight className={`h-5 w-5 shrink-0 transition-transform ${shown ? 'rotate-90' : ''}`} />
          <h3 className="flex items-center gap-2"><Lock className="h-4 w-4" /> Dados pessoais sensíveis</h3>
        </button>
      )}
      <div className={shown ? 'space-y-3' : 'hidden'}>
      <ReadMore>{admin
        ? <>Opcionais (LGPD). Só a própria pessoa e a direção enxergam; cada consulta fica registrada na auditoria.</>
        : <>Gênero, cor/raça e deficiência são <strong>opcionais</strong>. Só você e a direção de {membership?.short_name} enxergam. Não aparecem em listas, chamadas, financeiro, relatórios nem painéis.</>}</ReadMore>
      {open && (
        <>
          {row.isLoading ? <Skeleton className="h-24" /> : (
            <form onSubmit={(e) => { e.preventDefault(); if (!readOnly) save.mutate(false) }} className="space-y-3">
              <fieldset disabled={readOnly} className="min-w-0 space-y-3 border-0 p-0">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="s-gender">Como você se identifica?</Label>
                  <Select id="s-gender" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Não informar</option>{withCurrent(GENDERS, f.gender)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-trans">Você se considera trans?</Label>
                  <Select id="s-trans" value={f.is_trans} onChange={(e) => setF({ ...f, is_trans: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-race">Como você identifica sua cor/raça?</Label>
                  <Select id="s-race" value={f.race_color} onChange={(e) => setF({ ...f, race_color: e.target.value })}><option value="">Não informar</option>{withCurrent(RACES, f.race_color)}</Select></div>
                <div className="space-y-1.5"><Label htmlFor="s-pcd">É PCD (pessoa com deficiência)?</Label>
                  <Select id="s-pcd" value={f.is_pcd} onChange={(e) => setF({ ...f, is_pcd: e.target.value })}><option value="">Não informar</option><option value="yes">Sim</option><option value="no">Não</option></Select></div>
              </div>
              {f.is_pcd === 'yes' && <div className="space-y-1.5"><Label htmlFor="s-pcd-d">Qual?</Label><Input id="s-pcd-d" value={f.pcd_description} onChange={(e) => setF({ ...f, pcd_description: e.target.value })} /></div>}
              </fieldset>
              {!readOnly && <ButtonRow>
                {!bind && <Button type="submit" disabled={save.isPending} aria-label="Salvar" title="Salvar"><Save className="h-4 w-4" /><span className="ml-2 hidden sm:inline">Salvar</span></Button>}
                <Button type="button" variant="ghost" className="text-destructive" disabled={save.isPending}
                  onClick={async () => { if (await confirmBox(admin ? 'Apagar todos os dados sensíveis desta pessoa?' : 'Apagar todos os seus dados sensíveis? Você poderá preenchê-los de novo quando quiser.')) { setF({ gender: '', is_trans: '', race_color: '', is_pcd: '', pcd_description: '' }); save.mutate(true) } }}>
                  {admin ? 'Apagar dados sensíveis' : 'Apagar meus dados sensíveis'}
                </Button>
              </ButtonRow>}
            </form>
          )}
          {(consents.data?.length ?? 0) > 0 && (
            <section className="space-y-1 border-t border-border pt-3">
              <h3 className="text-sm">Consentimentos registrados</h3>
              <ProgressiveList items={consents.data!} render={(c) => (
                <p key={c.id} className="flex items-center justify-between text-muted-foreground"><span>{c.purpose === 'inscricao' ? 'Inscrição' : c.purpose} · {formatDateTime(c.granted_at, membership?.timezone)}</span>
                  <Badge>{c.revoked_at ? 'Revogado' : 'Ativo'}</Badge></p>
              )} />
            </section>
          )}
          {!admin && <p className="text-xs text-muted-foreground">Para corrigir dados cadastrais travados, excluir seu cadastro ou revogar consentimentos, fale com a direção.</p>}
        </>
      )}
      </div>
    </Wrap>
  )
}
