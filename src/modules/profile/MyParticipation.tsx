import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartHandshake, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { confirmBox } from '@/components/shared/DialogHost'
import { Badge, Button, Card, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency, formatDate } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { usePermission } from '@/core/permissions'
import { ArtisticLinks } from '@/modules/members/ArtisticLinks'
import { supabase } from '@/core/supabase'
import { useCatalog } from '@/modules/structure/CatalogEditor'

interface Participation {
  artistic: { id: string; name: string; section: string | null; level: string | null }[]
  collab: { id: string; name: string; exempt: boolean }[]
  paid: { id: string; name: string }[]
  category: string | null; price: number | null; percent: number; exempt_by: string | null
  requests: { id: string; kind: 'artistic' | 'collab'; action: 'add' | 'remove'; status: 'pending' | 'approved' | 'rejected'; created_at: string; label: string | null }[]
}
const REQ_LABEL = { pending: 'Aguardando a direção', approved: 'Aprovado', rejected: 'Recusado' } as const
const REQ_CLASS = { pending: 'bg-warning/15 text-warning', approved: 'bg-success/15 text-success', rejected: 'bg-destructive/15 text-destructive' } as const

/** Perfil → Minha participação: o que a pessoa faz no bloco (artística, colaborativa e remunerada), categoria, bolsa e mensalidade.
 *  Mudanças na artística e na colaborativa viram pedido e dependem da direção; abrir mão de uma colaboração vale na hora. */
export function MyParticipation({ memberId }: { memberId: string }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const instruments = useCatalog('instruments')
  const functions = useCatalog('artistic_functions')
  const [adding, setAdding] = useState<'artistic' | 'collab' | null>(null)
  const manager = usePermission('members.manage')
  const [pick, setPick] = useState('')
  const key = ['my-participation', orgId, memberId]
  const data = useQuery({
    queryKey: key,
    queryFn: async () => { const { data, error } = await supabase.rpc('my_participation', { p_member: memberId }); if (error) throw error; return data as Participation },
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['members', orgId] }); qc.invalidateQueries({ queryKey: ['member-links', orgId, memberId] }) }
  const onError = (e: unknown) => toast.error(friendlyError(e))
  const request = useMutation({
    mutationFn: async (v: { kind: 'artistic' | 'collab'; action: 'add' | 'remove'; instrument?: string; fn?: string; link?: string }) => {
      const { error } = await supabase.rpc('request_participation_change', { p_member: memberId, p_kind: v.kind, p_action: v.action, p_instrument: v.instrument ?? null, p_function: v.fn ?? null, p_link: v.link ?? null, p_note: null })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Pedido enviado. A direção vai avaliar.'); setAdding(null); setPick(''); refresh() }, onError,
  })
  const giveUp = useMutation({
    mutationFn: async (link: string) => { const { error } = await supabase.rpc('give_up_collaboration', { p_link: link }); if (error) throw error },
    onSuccess: () => { toast.success('Você deixou de colaborar.'); refresh() }, onError,
  })
  const d = data.data
  const descOf = (name: string) => functions.data?.find((x) => x.name === name)?.description?.trim() || ''
  if (!d) return null
  const pending = (kind: string, action: string, label: string) => d.requests.some((r) => r.status === 'pending' && r.kind === kind && r.action === action && r.label === label)
  const final = d.price != null ? Math.round(d.price * (100 - d.percent)) / 100 : null
  const options = adding === 'artistic' ? (instruments.data ?? []).filter((i) => i.is_active && !d.artistic.some((a) => a.name === i.name))
    : (functions.data ?? []).filter((f) => f.is_active && f.kind === 'collab' && !d.collab.some((c) => c.name === f.name))
  const addForm = (kind: 'artistic' | 'collab') => adding === kind && (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
      <Select className="min-w-40 flex-1" aria-label={kind === 'artistic' ? 'Atividade' : 'Colaboração'} value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">{kind === 'artistic' ? 'Escolha a atividade' : 'Escolha a colaboração'}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      <Button disabled={!pick || request.isPending} onClick={() => request.mutate({ kind, action: 'add', ...(kind === 'artistic' ? { instrument: pick } : { fn: pick }) })}>Pedir</Button>
      <Button variant="ghost" aria-label="Cancelar" onClick={() => { setAdding(null); setPick('') }}><X className="h-4 w-4" /></Button>
      {kind === 'collab' && pick && functions.data?.find((x) => x.id === pick)?.description?.trim() && <p className="basis-full text-sm text-muted-foreground">{functions.data?.find((x) => x.id === pick)?.description}</p>}
    </div>
  )
  const head = (title: string, kind?: 'artistic' | 'collab') => (
    <div className="flex items-center gap-1.5">
      <h4 className="font-semibold">{title}</h4>
      {kind && adding !== kind && <button type="button" className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs font-semibold text-foreground hover:bg-muted" aria-label={`Pedir mudança em ${title}`} title="Pedir mudança" onClick={() => { setAdding(kind); setPick('') }}><Plus className="h-3.5 w-3.5" /> Pedir mudança</button>}
    </div>
  )
  return (
    <Card className="space-y-4 p-4">
      <h3>Minha participação</h3>

      {manager ? (
        <div className="space-y-3">
          <ArtisticLinks memberId={memberId} mode="artistic" />
          <ArtisticLinks memberId={memberId} mode="collab" />
          <ArtisticLinks memberId={memberId} mode="paid" />
        </div>
      ) : (
        <>
      <section className="space-y-2">
        {head('Artística', 'artistic')}
        {d.artistic.length === 0 && <p className="text-muted-foreground">Nenhuma atividade artística.</p>}
        {d.artistic.map((a) => (
          <div key={a.id} className="flex items-center gap-1.5">
            <p className="min-w-0 break-words">{a.name}{a.section ? <span className="text-muted-foreground"> · {a.section}</span> : null}{a.level ? <span className="text-muted-foreground"> · {a.level}</span> : null}</p>
            {pending('artistic', 'remove', a.name)
              ? <Badge className={REQ_CLASS.pending}>Saída pedida</Badge>
              : <button type="button" className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive" aria-label={`Pedir para sair de ${a.name}`} title="Pedir para sair" onClick={async () => { if (await confirmBox(`Pedir à direção para sair de “${a.name}”?`)) request.mutate({ kind: 'artistic', action: 'remove', link: a.id }) }}><X className="h-3.5 w-3.5" /> Pedir para sair</button>}
          </div>
        ))}
        {addForm('artistic')}
      </section>

      <section className="space-y-2 border-t border-border pt-3">
        {head('Colaborativa', 'collab')}
        {d.collab.length === 0 && <p className="text-muted-foreground">Você não colabora em nenhuma frente.</p>}
        {d.collab.map((c) => (
          <div key={c.id} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 break-words">{c.name}{c.exempt && <span className="text-muted-foreground"> · com isenção</span>}</p>
              <button type="button" className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10" disabled={giveUp.isPending} onClick={async () => { if (await confirmBox(`Abrir mão de “${c.name}”? Você deixa de colaborar${c.exempt ? ' e volta a pagar a mensalidade da sua categoria' : ''}. Para voltar, será preciso pedir à direção.`)) giveUp.mutate(c.id) }}><HeartHandshake className="h-3.5 w-3.5" /> Abrir mão</button>
            </div>
            {descOf(c.name) && <p className="text-sm text-muted-foreground">{descOf(c.name)}</p>}
          </div>
        ))}
        {addForm('collab')}
      </section>

      <section className="space-y-1 border-t border-border pt-3">
        {head('Remunerada')}
        {d.paid.length === 0 ? <p className="text-muted-foreground">Nenhuma atividade remunerada.</p> : <p>{d.paid.map((p) => p.name).join(', ')}</p>}
        <p className="text-xs text-muted-foreground">Mudanças nesta só pela direção.</p>
      </section>

        </>
      )}

      <section className="space-y-1 border-t border-border pt-3">
        {head('Categoria e mensalidade')}
        {d.category ? <p>Categoria: <strong>{d.category}</strong></p> : <p className="text-muted-foreground">Você ainda não tem categoria de contribuição. A direção define.</p>}
        {d.percent > 0 && <p>Bolsa: <strong>{d.percent}%</strong></p>}
        {d.exempt_by ? <p>Mensalidade: <strong>isento</strong> <span className="text-muted-foreground">(pela função {d.exempt_by})</span></p>
          : d.paid.length > 0 ? <p>Mensalidade: <strong>não contribui</strong> <span className="text-muted-foreground">(atividade remunerada)</span></p>
          : final != null && <p>Mensalidade: <strong>{formatCurrency(final)}</strong>{d.percent > 0 && <span className="text-muted-foreground"> (de {formatCurrency(d.price!)}, com a bolsa)</span>}</p>}
      </section>

      {d.requests.length > 0 && (
        <section className="space-y-1 border-t border-border pt-3">
          <h4 className="font-semibold">Meus pedidos</h4>
          {d.requests.slice(0, 5).map((r) => (
            <p key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{r.action === 'add' ? 'Entrar em' : 'Sair de'} {r.label ?? '—'} <span className="text-muted-foreground">· {formatDate(r.created_at.slice(0, 10))}</span></span>
              <Badge className={REQ_CLASS[r.status]}>{REQ_LABEL[r.status]}</Badge>
            </p>
          ))}
        </section>
      )}
    </Card>
  )
}
