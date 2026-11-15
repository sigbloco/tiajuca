import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/core/supabase'

export type Gender = 'f' | 'm' | null

export interface LineInput {
  /** Nome curto do bloco ("Tia Juca"): fecha a frase com "da Tia Juca". */
  blocName: string
  gender: Gender
  artistic: { name: string; section: string | null }[]
  staff: { kind: string; instrument: string | null; section: string | null }[]
  /** Colaborações e atividades remuneradas (nomes do cadastro de categorias). */
  functions: string[]
}

const plain = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const lower = (v: string) => v.trim().toLowerCase()
const cap = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v)

/** Gênero vindo dos dados sensíveis (valores "feminino", "masculino" ou texto livre como "Mulher"); qualquer outro caso fica neutro. */
export function genderOf(raw: string | null | undefined): Gender {
  const g = plain(raw ?? '')
  if (/^(fem|mulher|f$)/.test(g)) return 'f'
  if (/^(masc|homem|m$)/.test(g)) return 'm'
  return null
}

/** Títulos com flexão de gênero: [masculino, feminino, neutro]. */
const TITLES: Record<string, [string, string, string]> = {
  professor: ['professor', 'professora', 'professor(a)'],
  monitor: ['monitor', 'monitora', 'monitor(a)'],
  direcao: ['diretor', 'diretora', 'diretor(a)'],
  diretor: ['diretor', 'diretora', 'diretor(a)'],
  diretora: ['diretor', 'diretora', 'diretor(a)'],
  escritor: ['escritor', 'escritora', 'escritor(a)'],
  escritora: ['escritor', 'escritora', 'escritor(a)'],
  regente: ['regente', 'regente', 'regente'],
  regencia: ['regente', 'regente', 'regente'],
}
const title = (key: string, g: Gender) => { const t = TITLES[plain(key)]; return t ? t[g === 'm' ? 0 : g === 'f' ? 1 : 2] : null }

/** "no sopro", "na percussão", "na performance". */
const FEMININE_SECTIONS = /(ao|ade|ncia|ance|a|e)$/
const inSection = (section: string) => `${FEMININE_SECTIONS.test(plain(section)) ? 'na' : 'no'} ${lower(section)}`

/**
 * Frase da participação da pessoa no bloco, ex.: "Clarinete no sopro da Tia Juca e escritora",
 * "Professora de tamborim e regente na percussão da Tia Juca". Vazia se não há nada a dizer.
 */
export function participationLine({ blocName, gender, artistic, staff, functions }: LineInput): string {
  const phrases: { text: string; hasSection: boolean }[] = []

  // Artística: "Sax Tenor e Clarinete no sopro", um trecho por naipe.
  const bySection = new Map<string, string[]>()
  for (const a of artistic) { const k = a.section ?? ''; bySection.set(k, [...(bySection.get(k) ?? []), a.name]) }
  for (const [section, names] of bySection) {
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]
    phrases.push(section ? { text: `${list} ${inSection(section)}`, hasSection: true } : { text: list, hasSection: false })
  }

  // Equipe: "professora de tamborim", "monitor de sopro", "regente na percussão".
  const staffKinds = new Set<string>()
  for (const s of staff) {
    const role = title(s.kind, gender)
    if (!role) continue
    staffKinds.add(plain(s.kind))
    if (plain(s.kind) === 'regente') phrases.push(s.section ? { text: `${role} ${inSection(s.section)}`, hasSection: true } : { text: role, hasSection: false })
    else phrases.push({ text: `${role} de ${lower(s.instrument ?? s.section ?? 'música')}`, hasSection: false })
  }

  // Colaborativas e remuneradas (sem repetir o que a equipe já disse).
  for (const f of functions) {
    const k = plain(f)
    if (staffKinds.has(k) || (k === 'regencia' && staffKinds.has('regente'))) continue
    const t = title(f, gender)
    phrases.push({ text: t ?? lower(f), hasSection: false })
  }
  if (phrases.length === 0) return ''

  // "da Tia Juca" fecha o último trecho que tem naipe; sem naipe nenhum, fecha o primeiro trecho.
  let at = -1
  phrases.forEach((p, i) => { if (p.hasSection) at = i })
  if (at < 0) at = 0
  const done = phrases.map((p, i) => (i === at ? `${p.text} da ${blocName}` : p.text))
  const joined = done.length > 1 ? `${done.slice(0, -1).join(', ')} e ${done[done.length - 1]}` : done[0]
  return cap(joined)
}

interface Participation { artistic: { name: string; section: string | null }[]; collab: { name: string }[]; paid: { name: string }[] }

/** Dados da participação atual de quem está logado, já em frase. */
export function useParticipationLine(orgId: string, memberId: string | undefined, blocName: string): string | null {
  const q = useQuery({
    queryKey: ['participation-line', orgId, memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const [part, staff, sens] = await Promise.all([
        supabase.rpc('my_participation', { p_member: memberId }),
        supabase.from('staff_assignments').select('staff_kind, instruments(name), sections(name), cycles!inner(is_current)').eq('organization_id', orgId).eq('member_id', memberId!).is('valid_to', null).eq('cycles.is_current', true),
        supabase.from('member_sensitive_data').select('gender').eq('member_id', memberId!).maybeSingle(),
      ])
      if (part.error) throw part.error
      const p = part.data as Participation
      const staffRows = ((staff.data ?? []) as unknown as { staff_kind: string; instruments: { name: string } | null; sections: { name: string } | null }[])
        .map((r) => ({ kind: r.staff_kind, instrument: r.instruments?.name ?? null, section: r.sections?.name ?? null }))
      return { artistic: p.artistic ?? [], staff: staffRows, functions: [...(p.collab ?? []), ...(p.paid ?? [])].map((x) => x.name), gender: genderOf((sens.data as { gender: string | null } | null)?.gender) }
    },
  })
  if (!q.data) return null
  return participationLine({ blocName, ...q.data })
}
