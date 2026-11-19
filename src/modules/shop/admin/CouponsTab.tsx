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

interface Coupon { id: string; code: string; discount_pct: number; is_active: boolean }

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

/** Loja → Cupons: cria cupons de desconto em %, ativa e desativa. Tudo grava na hora (nada de botão de salvar por linha). */
export function CouponsTab() {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [pct, setPct] = useState('')
  const q = useQuery({
    queryKey: ['shop', orgId, 'coupons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_coupons').select('id, code, discount_pct, is_active').eq('organization_id', orgId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((c) => ({ ...c, discount_pct: Number(c.discount_pct) })) as Coupon[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['shop', orgId, 'coupons'] })
  const onError = (e: unknown) => toast.error(/duplicate|unique|23505/i.test(String((e as Error)?.message ?? e)) ? 'Já existe um cupom com este código.' : friendlyError(e))
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shop_coupons').insert({ organization_id: orgId, code, discount_pct: parseDiscount(pct)!, is_active: true })
      if (error) throw error
    },
    onSuccess: () => { setCode(''); setPct(''); setAdding(false); refresh(); notifySaved('Cupom criado.') },
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
          <form className="flex items-end gap-2" onSubmit={(e) => {
            e.preventDefault()
            if (requireFields([['Código (3 a 30 letras, números, - ou _)', validCode(code)], ['Desconto (de 0,01 a 100%)', parseDiscount(pct) !== null]])) create.mutate()
          }}>
            <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="cp-code" required>Código</Label>
              <Input id="cp-code" autoCapitalize="characters" autoComplete="off" maxLength={30} className="uppercase tracking-wider" placeholder="BLOCO10" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="cp-pct" required>Desconto</Label>
              <div className="flex items-center gap-1"><Input id="cp-pct" inputMode="decimal" className="w-16 text-center" maxLength={6} placeholder="10" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,]/g, ''))} /><span className="font-semibold">%</span></div></div>
            <Button type="submit" className="shrink-0" disabled={create.isPending} aria-label="Criar cupom" title="Criar cupom"><Plus className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">Criar cupom</span></Button>
          </form>
        </Card>
      )}
      {q.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {q.isError && <EmptyState>Não foi possível carregar os cupons.</EmptyState>}
      {q.data && items.length === 0 && <EmptyState>Nenhum cupom ainda. Crie o primeiro.</EmptyState>}
      {paged.visible.map((c) => (
        <Card key={c.id} className={`flex flex-wrap items-center gap-3 p-3 ${c.is_active ? '' : 'opacity-70'}`}>
          <div className="min-w-0 flex-1">
            <p className="break-all font-display text-lg font-extrabold tracking-wider">{c.code}</p>
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
        </Card>
      ))}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onClick={paged.more} />
    </div>
  )
}
