import { SaveButton } from '@/components/shared/SaveButton'
import { confirmBox } from '@/components/shared/DialogHost'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/ui/masked-inputs'
import { Button, Input, Select } from '@/components/ui/primitives'
import { friendlyError } from '@/core/errors'
import { formatCurrency } from '@/core/format'
import { useOrgId } from '@/core/organization'
import { supabase } from '@/core/supabase'
import { notifySaved } from '@/core/undo'
import { useCatalog } from '@/modules/structure/CatalogEditor'

export type Scope = 'all' | 'section' | 'instrument'

export type Kind = 'fixed' | 'percent' | 'hourly' | 'group'

export interface Rule {
  id?: string
  kind: Kind
  fixed_amount: number | null
  percent: number | null
  hourly_rate: number | null
  scope: Scope
  section_id: string | null
  instrument_id: string | null
  /** Regra "Divisão do grupo": o grupo (Direção, Professor…). */
  group_key?: string | null
}

export interface RuleRow extends Rule { id: string; member_id: string; members: { full_name: string; display_name: string | null } | null }

export const SCOPE_LABEL: Record<Scope, string> = { all: 'Mensalidades dos contribuintes', section: 'Mensalidades de um naipe', instrument: 'Mensalidades de um instrumento' }

export interface GroupRule { id: string; group_key: string; percent: number; scope: 'all' | 'section'; section_id: string | null }

/** Formulário de uma regra: fixo, % (de tudo, naipe ou instrumento) ou valor por hora de aula. */
export function RuleEditor({ rule, memberId, cycleId, canEdit, onDone, groupKeys, haveGroups = [] }: { rule: Rule; memberId: string; cycleId: string; canEdit: boolean; onDone: () => void; /** Grupos da pessoa (Direção, Professor…): a "Divisão do grupo" é a deles. */ groupKeys: string[]; /** Grupos em que ela já tem a regra. */ haveGroups?: string[] }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const instruments = useCatalog('instruments')
  const [r, setR] = useState<Rule>(rule)
  const [pct, setPct] = useState(rule.percent === null ? '' : String(rule.percent).replace('.', ','))
  const percent = Number(pct.replace(',', '.'))
  const target = r.scope === 'section' ? r.section_id : r.instrument_id
  const newGroups = groupKeys.filter((k) => !haveGroups.includes(k))
  const valid = r.kind === 'group' ? (rule.id ? !!r.group_key : newGroups.length > 0)
    : r.kind === 'fixed' ? r.fixed_amount !== null && r.fixed_amount >= 0
    : r.kind === 'hourly' ? r.hourly_rate !== null && r.hourly_rate >= 0 && (r.scope === 'all' || !!r.section_id)
      : Number.isFinite(percent) && percent > 0 && percent <= 100 && (r.scope === 'all' || !!target)
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-pay-rules', orgId] })
  const save = useMutation({
    mutationFn: async () => {
      if (r.kind === 'group' && !rule.id) {
        const rows = newGroups.map((k) => ({ kind: 'group', group_key: k, scope: 'all', fixed_amount: null, percent: null, hourly_rate: null, section_id: null, instrument_id: null, organization_id: orgId, cycle_id: cycleId, member_id: memberId }))
        const { error } = await supabase.from('staff_pay_rules').insert(rows)
        if (error) throw error
        return
      }
      const pctRule = r.kind === 'percent'
      const row = {
        kind: r.kind, group_key: r.kind === 'group' ? r.group_key : null, scope: r.kind === 'fixed' || r.kind === 'group' ? 'all' : r.kind === 'hourly' ? (r.scope === 'section' ? 'section' : 'all') : r.scope,
        fixed_amount: r.kind === 'fixed' ? r.fixed_amount : null, percent: pctRule ? percent : null, hourly_rate: r.kind === 'hourly' ? r.hourly_rate : null,
        section_id: (pctRule || r.kind === 'hourly') && r.scope === 'section' ? r.section_id : null,
        instrument_id: pctRule && r.scope === 'instrument' ? r.instrument_id : null,
      }
      const q = rule.id ? supabase.from('staff_pay_rules').update(row).eq('id', rule.id)
        : supabase.from('staff_pay_rules').insert({ ...row, organization_id: orgId, cycle_id: cycleId, member_id: memberId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => { notifySaved('Regra salva.'); refresh(); onDone() },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const naipeSelect = (
    <Select aria-label="Naipe" disabled={!canEdit} value={r.section_id ?? ''} onChange={(e) => setR({ ...r, section_id: e.target.value || null })}>
      <option value="">Escolha o naipe</option>{(sections.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  )
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-2">
      <Select aria-label="Tipo" disabled={!canEdit} value={r.kind} onChange={(e) => { const k = e.target.value as Kind; setR({ ...r, kind: k, scope: 'all', section_id: null, instrument_id: null, group_key: k === 'group' ? (rule.group_key ?? groupKeys[0] ?? null) : null }) }}>
        <option value="percent">% exclusiva</option><option value="hourly">Por hora de aula</option><option value="group">Divisão do grupo</option><option value="fixed">Valor fixo</option>
      </Select>
      {r.kind === 'group' && (
        groupKeys.length === 0
          ? <p className="text-sm text-muted-foreground">Esta pessoa não tem categoria remunerada (Direção, Professor, Monitor…). Marque na ficha dela.</p>
          : <p className="text-sm text-muted-foreground">Recebe uma parte igual da % do {(rule.id ? [r.group_key ?? ''] : newGroups.length ? newGroups : groupKeys).join(' e do ')} (a % fica no cabeçalho do grupo).</p>
      )}
      {r.kind === 'fixed' && (
        <div className="flex items-center gap-2"><div className="w-40 shrink-0"><MoneyInput value={r.fixed_amount} onChange={(v) => setR({ ...r, fixed_amount: v })} /></div><span className="font-semibold">por mês</span></div>
      )}
      {r.kind === 'percent' && (
        <>
          <div className="flex items-center gap-1.5">
            <Input className="w-14 shrink-0 px-1 text-center" aria-label="Porcentagem" inputMode="decimal" maxLength={5} disabled={!canEdit} placeholder="00" value={pct} onChange={(e) => setPct(e.target.value)} />
            <span className="font-semibold">%</span>
            <Select className="min-w-0 flex-1" aria-label="Sobre" disabled={!canEdit} value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value as Scope, section_id: null, instrument_id: null })}>
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
            </Select>
          </div>
          {r.scope === 'section' && naipeSelect}
          {r.scope === 'instrument' && (
            <Select aria-label="Instrumento" disabled={!canEdit} value={r.instrument_id ?? ''} onChange={(e) => setR({ ...r, instrument_id: e.target.value || null })}>
              <option value="">Escolha o instrumento</option>{(instruments.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </>
      )}
      {r.kind === 'hourly' && (
        <>
          <div className="flex items-center gap-2"><div className="w-40 shrink-0"><MoneyInput value={r.hourly_rate} onChange={(v) => setR({ ...r, hourly_rate: v })} /></div><span className="font-semibold">por hora de aula</span></div>
          <Select aria-label="Aulas" disabled={!canEdit} value={r.scope === 'section' ? 'section' : 'all'} onChange={(e) => setR({ ...r, scope: e.target.value as Scope, section_id: null })}>
            <option value="all">Todas as oficinas</option><option value="section">Oficinas de um naipe</option>
          </Select>
          {r.scope === 'section' && naipeSelect}
          <p className="text-sm text-muted-foreground">Cada dia de aula conta 2 h: a aula e a meia hora final de ensaio. Dia cancelado (feriado, chuva) fica de fora, ao cancelar a aula no Calendário.</p>
        </>
      )}
      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <SaveButton className="w-full" disabled={!valid || save.isPending} onClick={() => save.mutate()} hint="Salvar regra" />
          <Button className="w-full" variant="outline" aria-label="Cancelar" title="Cancelar" onClick={onDone}><X className="h-4 w-4" /> Cancelar</Button>
        </div>
      )}
    </div>
  )
}

/** Regra pronta: uma linha curta ("3,5% da receita total das oficinas") com editar e apagar. */
export function RuleLine({ rule, memberId, cycleId, canEdit, summary, detail, hours, groupKeys }: { groupKeys: string[]; rule: RuleRow; memberId: string; cycleId: string; canEdit: boolean; summary: string; detail: string; /** Regra por hora: horas do mês (automáticas pelas aulas ou corrigidas à mão). */ hours?: { auto: number; value: number; competence: string } }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('staff_pay_rules').delete().eq('id', rule.id); if (error) throw error },
    onSuccess: () => { notifySaved('Regra removida.'); qc.invalidateQueries({ queryKey: ['staff-pay-rules', orgId] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const saveHours = useMutation({
    mutationFn: async (v: number | null) => {
      if (v === null || v === hours?.auto) { const { error } = await supabase.from('staff_pay_hours').delete().eq('rule_id', rule.id).eq('competence', hours!.competence); if (error) throw error }
      else { const { error } = await supabase.from('staff_pay_hours').upsert({ organization_id: orgId, rule_id: rule.id, competence: hours!.competence, hours: v }, { onConflict: 'rule_id,competence' }); if (error) throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-pay-hours', orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  })
  if (editing) return <RuleEditor rule={rule} memberId={memberId} cycleId={cycleId} canEdit={canEdit} onDone={() => setEditing(false)} groupKeys={groupKeys} />
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="font-semibold">{summary}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {hours && (
          <label className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">horas no mês</span>
            <Input key={`${hours.value}-${hours.auto}`} className="h-8 w-20 px-2 text-center" inputMode="decimal" disabled={!canEdit} defaultValue={String(hours.value).replace('.', ',')} aria-label="Horas trabalhadas no mês"
              onBlur={(e) => { const t = e.target.value.trim().replace(',', '.'); const n = t === '' ? null : Number(t); if (n !== null && !(n >= 0)) return; if ((n ?? hours.auto) !== hours.value) saveHours.mutate(n) }} />
            {hours.value !== hours.auto && <span className="text-xs text-muted-foreground">pelas aulas: {String(hours.auto).replace('.', ',')} h</span>}
          </label>
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar regra" title="Editar" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Remover regra" title="Remover regra" onClick={async () => { if (await confirmBox('Remover esta regra de pagamento?')) del.mutate() }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}

/** Divisão do grupo: `%` + "do todo" ou um naipe; grava ao sair do campo. */
export function GroupRuleEditor({ groupKey, rule, cycleId, canEdit, count, total, label = 'Divisão do grupo', simple = false }: { groupKey: string; rule?: GroupRule; cycleId: string; canEdit: boolean; count: number; total: number; label?: string; /** Só a % (caixa do bloco). */ simple?: boolean }) {
  const orgId = useOrgId()
  const qc = useQueryClient()
  const sections = useCatalog('sections')
  const [pct, setPct] = useState(rule ? String(rule.percent).replace('.', ',') : '')
  const [sectionId, setSectionId] = useState(rule?.section_id ?? '')
  const save = useMutation({
    mutationFn: async (v: { pct: string; section: string }) => {
      const n = Number(v.pct.trim().replace(',', '.'))
      if (v.pct.trim() === '' || n === 0) { if (rule) { const { error } = await supabase.from('staff_group_rules').delete().eq('id', rule.id); if (error) throw error } return }
      if (!(n > 0 && n <= 100)) throw new Error('Informe uma porcentagem entre 0 e 100.')
      const row = { percent: n, scope: v.section ? 'section' : 'all', section_id: v.section || null }
      const { error } = rule ? await supabase.from('staff_group_rules').update(row).eq('id', rule.id)
        : await supabase.from('staff_group_rules').insert({ ...row, organization_id: orgId, cycle_id: cycleId, group_key: groupKey })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-group-rules', orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  })
  const commit = (v = { pct, section: sectionId }) => { if (canEdit && !save.isPending) save.mutate(v) }
  const each = count > 0 ? total / count : 0
  return (
    <div className="space-y-1 rounded-lg bg-muted/50 p-2">
      <div className="flex items-center gap-1.5">
        <span className="whitespace-nowrap font-semibold">{label}</span>
        <Input className="h-8 w-12 shrink-0 px-1 text-center" inputMode="decimal" maxLength={5} placeholder="00" disabled={!canEdit} aria-label={`Porcentagem de ${groupKey}`} value={pct} onChange={(e) => setPct(e.target.value)} onBlur={() => commit()} />
        <span className="font-semibold">%</span>
        {!simple && (
          <Select className="h-8 min-w-0 flex-1 py-0 pl-2 pr-7 text-sm" disabled={!canEdit} aria-label="Sobre" value={sectionId} onChange={(e) => { setSectionId(e.target.value); commit({ pct, section: e.target.value }) }}>
            <option value="">Tudo</option>
            {(sections.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        )}
      </div>
      {rule && <p className="text-sm text-muted-foreground">= {formatCurrency(total)}{simple ? ' (do que resta depois de hora-aula e % exclusivas)' : ''}{count > 0 ? ` · ${formatCurrency(each)} para cada (${count})` : rule && !simple ? ' · ninguém na divisão ainda: adicione a regra "Divisão do grupo" em cada pessoa' : ''}</p>}
    </div>
  )
}
