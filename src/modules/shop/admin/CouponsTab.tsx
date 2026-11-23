import { confirmBox } from '@/components/shared/DialogHost'
import { SaveInput } from '@/components/shared/ConfirmField'
import { ShowMore, usePaged } from '@/components/shared/Paged'
import { requireFields } from '@/core/required'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, EmptyState, Input, Label, Skeleton } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'

interface Coupon { id: string; code: string; discount_pct: number; is_active: boolean; valid_until: string | null; max_uses: number | null }

/** Código do cupom: maiúsculas, números, "-" e "_" (3 a 30). */
export const normalizeCode = (v: string): string => v.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
export const validCode = (v: string): boolean => /^[A-Z0-9_-]{3,30}$/.test(v)
/** "12,5" → 12.5; vazio ou fora de 0,01–100 → null. */
export function parseDiscount(v: string): number | null {
  const t = v.trim().replace(',', '.')
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= 100 ? n : null
}
const fmtPct = (n: number) => String(n).replace('.', ',')
/** Limite de usos: vazio = sem limite; senão inteiro de 1 a 100000. `undefined` = inválido. */
export function parseMaxUses(v: string): number | null | undefined {
  const t = v.trim()
  if (t === '') return null
  return /^[0-9]{1,6}$/.test(t) && Number(t) >= 1 && Number(t) <= 100000 ? Number(t) : undefined
}
/** Hoje no horário de Brasília (AAAA-MM-DD), para comparar com a validade. */
export const todayBR = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/** Loja → Cupons: cria cupons de desconto em %, ativa e desativa. Tudo grava na hora (nada de botão de salvar por linha). */
export function CouponsTab() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [pct, setPct] = useState('')
  const [until, setUntil] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const q = useQuery({
    queryKey: ['shop', orgId, 'coupons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_coupons').select('id, code, discount_pct, is_active, valid_until, max_uses').eq('organization_id', orgId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((c) => ({ ...c, discount_pct: Number(c.discount_pct) })) as Coupon[]
    },
  })
  // Usos = pedidos não cancelados que ficaram com o cupom (mesma conta do servidor para o limite).
  const uses = useQuery({
    queryKey: ['shop', orgId, 'coupons', 'uses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_orders').select('coupon_code').eq('organization_id', orgId).not('coupon_code', 'is', null).neq('status', 'cancelled')
      if (error) throw error
      const m = new Map<string, number>()
      for (const r of data ?? []) m.set(r.coupon_code as string, (m.get(r.coupon_code as string) ?? 0) + 1)
      return m
    },
  })
  const today = todayBR()
  const refresh = () => qc.invalidateQueries({ queryKey: ['shop', orgId, 'coupons'] })
  const onError = (e: unknown) => toast.error(/duplicate|unique|23505/i.test(String((e as Error)?.message ?? e)) ? 'Já existe um cupom com este código.' : friendlyError(e))
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shop_coupons').insert({ organization_id: orgId, code, discount_pct: parseDiscount(pct)!, is_active: true, valid_until: until || null, max_uses: parseMaxUses(maxUses) ?? null })
      if (error) throw error
    },
    onSuccess: () => { setCode(''); setPct(''); setUntil(''); setMaxUses(''); setAdding(false); refresh(); notifySaved('Cupom criado.') },
    onError,
  })
  const patch = useMutation({
    mutationFn: async (v: { id: string; fields: Partial<Omit<Coupon, 'id'>> }) => {
      const { error } = await supabase.from('shop_coupons').update(v.fields).eq('id', v.id).eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('shop_coupons').delete().eq('id', id).eq('organization_id', orgId); if (error) throw error },
    onSuccess: () => { refresh(); notifySaved('Cupom excluído.') },
    onError,
  })
  const items = q.data ?? []
  const paged = usePaged(items)

  return (
    <div className="space-y-3">
      <Button variant="add" className="w-full" onClick={() => setAdding(!adding)}><Plus className="h-4 w-4" /> Novo cupom</Button>
      {adding && (
        <Card className="space-y-3 p-4">
          {/* Código, desconto e botão lado a lado; no celular o botão fica só com o "+". */}
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault()
            if (requireFields([['Código (3 a 30 letras, números, - ou _)', validCode(code)], ['Desconto (de 0,01 a 100%)', parseDiscount(pct) !== null], ['Limite de usos (vazio ou de 1 a 100000)', parseMaxUses(maxUses) !== undefined]])) create.mutate()
          }}>
            <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="cp-code" required>Código</Label>
              <Input id="cp-code" autoCapitalize="characters" autoComplete="off" maxLength={30} className="uppercase tracking-wider" placeholder="BLOCO10" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="cp-pct" required>Desconto</Label>
              <div className="flex items-center gap-1"><Input id="cp-pct" inputMode="decimal" className="w-16 text-center" maxLength={6} placeholder="10" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} /><span className="font-semibold">%</span></div></div>
            <Button type="submit" className="shrink-0" disabled={create.isPending} aria-label="Criar cupom" title="Criar cupom"><Plus className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">Criar cupom</span></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="cp-until">Válido até</Label>
                <Input id="cp-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="cp-max">Limite de usos</Label>
                <Input id="cp-max" inputMode="numeric" maxLength={6} placeholder="Sem limite" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} /></div>
            </div>
            <p className="text-sm text-muted-foreground">Sem data, o cupom não vence. Sem limite, pode ser usado em quantos pedidos quiserem (pedido cancelado devolve o uso).</p>
          </form>
        </Card>
      )}
      {q.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os cupons.</EmptyState>}
      {q.data && items.length === 0 && <EmptyState>Nenhum cupom ainda. Crie o primeiro.</EmptyState>}
      {paged.visible.map((c) => {
        const used = uses.data?.get(c.code) ?? 0
        const expired = !!c.valid_until && c.valid_until < today
        const exhausted = c.max_uses !== null && used >= c.max_uses
        return (
        <Card key={c.id} className={`flex flex-wrap items-center gap-3 p-3 ${c.is_active && !expired && !exhausted ? '' : 'opacity-70'}`}>
          <div className="min-w-0 flex-1">
            <p className="break-all font-display text-lg font-extrabold tracking-wider">{c.code}</p>
            <p className="text-sm text-muted-foreground">Usado {used} {used === 1 ? 'vez' : 'vezes'}{c.max_uses !== null ? ` de ${c.max_uses}` : ''}{expired ? ' · vencido' : ''}{exhausted ? ' · esgotado' : ''}</p>
            <label className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5" checked={c.is_active} disabled={patch.isPending}
                onChange={(e) => patch.mutate({ id: c.id, fields: { is_active: e.target.checked } })} /> Ativo
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <SaveInput className="w-20 flex-none" inputClassName="text-center" aria-label={`Desconto do cupom ${c.code}`} value={fmtPct(c.discount_pct)}
              onSave={async (v) => { const n = parseDiscount(v); if (n === null) { toast.error('O desconto deve ficar entre 0,01 e 100%.'); throw new Error('desconto inválido') } if (n !== c.discount_pct) await patch.mutateAsync({ id: c.id, fields: { discount_pct: n } }) }} />
            <span className="font-semibold">%</span>
          </div>
          <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Excluir o cupom ${c.code}`} title="Excluir cupom" disabled={remove.isPending}
            onClick={async () => { if (await confirmBox(`Excluir o cupom ${c.code}? Para só pausar, desmarque Ativo.`)) remove.mutate(c.id) }}><Trash2 className="h-4 w-4" /></Button>
          <div className="grid w-full grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor={`cu-${c.id}`}>Válido até</Label>
              <Input id={`cu-${c.id}`} type="date" value={c.valid_until ?? ''} disabled={patch.isPending}
                onChange={(e) => patch.mutate({ id: c.id, fields: { valid_until: e.target.value || null } })} /></div>
            <div className="space-y-1"><Label>Limite de usos</Label>
              <SaveInput numeric allowEmpty inputClassName="text-center" placeholder="Sem limite" aria-label={`Limite de usos do cupom ${c.code}`} value={c.max_uses === null ? '' : String(c.max_uses)}
                onSave={async (v) => { const n = parseMaxUses(v); if (n === undefined) { toast.error('O limite deve ficar entre 1 e 100000, ou vazio para sem limite.'); throw new Error('limite inválido') } if (n !== c.max_uses) await patch.mutateAsync({ id: c.id, fields: { max_uses: n } }) }} /></div>
          </div>
        </Card>
        )
      })}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onClick={paged.more} />
    </div>
  )
}
