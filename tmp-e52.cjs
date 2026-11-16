const fs = require('fs')
function edit(p, fn) { let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); const o = s; s = fn(s); if (s === o) throw new Error('no change ' + p); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s) }
function rep(s, a, b) { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); return s.replace(a, () => b) }

edit('src/modules/members/ArtisticLinks.tsx', s => {
  s = rep(s, "import { CompensationPick } from './StaffSection'\n", "")
  s = rep(s, "/** Regência é uma atividade artística (atribuição de regente de um naipe, a mesma de Naipes): aparece ao lado dos instrumentos. */\nconst REGENCIA = '__regencia'", "/** Regência é uma atividade artística (atribuição de regente de um naipe, a mesma de Naipes): \"Regência (Sopro)\", \"Regência (Percussão)\"… aparecem ao lado dos instrumentos. Não é remunerada. */\nconst REGENCIA = '__regencia:'")
  s = rep(s, "  const [regSection, setRegSection] = useState('')\n  const [regComp, setRegComp] = useState<'paid' | 'collaborative' | null>(null)\n", "")
  s = rep(s, "; setRegSection(''); setRegComp(null) }", " }")
  s = rep(s, "section_id: regSection, compensation: regComp, cycle_id: cycleId })", "section_id: f.instrument_id.slice(REGENCIA.length), compensation: 'collaborative', cycle_id: cycleId })")
  s = rep(s, "  const isReg = f.instrument_id === REGENCIA", "  const isReg = f.instrument_id.startsWith(REGENCIA)")
  s = s.split("disabled={isReg ? !regSection || !regComp || addReg.isPending :").join("disabled={isReg ? addReg.isPending :")
  s = rep(s, "options={[{ id: REGENCIA, label: 'Regência', hint: 'atividade artística' }, ...active(instruments.data)", "options={[...active(sections.data).map((x) => ({ id: REGENCIA + x.id, label: `Regência (${x.name})`, hint: 'atividade artística' })), ...active(instruments.data)")
  s = rep(s, "<Chip label={isReg ? 'Regência' : instrumentLabel(f.instrument_id)}", "<Chip label={isReg ? `Regência (${sections.data?.find((x) => x.id === f.instrument_id.slice(REGENCIA.length))?.name ?? ''})` : instrumentLabel(f.instrument_id)}")
  // remove naipe select + compensation pick
  const a = s.indexOf("          {isReg && (\n            <div className=\"space-y-1.5\">\n              <Select aria-label=\"Naipe da regência\"")
  const b = s.indexOf("          )}\n", a) + "          )}\n".length
  if (a < 0) throw new Error('reg block')
  s = s.slice(0, a) + s.slice(b)
  // lista
  s = rep(s, "            <p className=\"break-words font-semibold\">Regência</p>\n            <p className=\"text-muted-foreground\">{[sections.data?.find((x) => x.id === g.section_id)?.name, g.compensation === 'paid' ? 'remunerada' : 'colaborativa'].filter(Boolean).join(' · ')}</p>", "            <p className=\"break-words font-semibold\">Regência ({sections.data?.find((x) => x.id === g.section_id)?.name ?? ''})</p>")
  // cancelar com texto
  s = s.split("<Button size=\"sm\" variant=\"outline\" onClick={close} aria-label=\"Cancelar\" title=\"Cancelar\"><X className=\"h-4 w-4\" /></Button>").join("<Button size=\"sm\" variant=\"outline\" onClick={close} aria-label=\"Cancelar\" title=\"Cancelar\"><X className=\"h-4 w-4\" /> Cancelar</Button>")
  return s
})

edit('src/modules/finance/TeamPage.tsx', s => {
  // regentes não são remunerados: saem do grupo de pagamento
  const a = s.indexOf("      // Regência é atribuição de regente (Naipes): quem rege como remunerado")
  const b = s.indexOf("      return [...rows.map((r) => ({ member_id: r.member_id, staff_kind: r.artistic_functions?.name ?? '', members: r.members })), ...regRows]\n")
  if (a < 0 || b < a) throw new Error('regentes block')
  s = s.slice(0, a) + "      return rows.map((r) => ({ member_id: r.member_id, staff_kind: r.artistic_functions?.name ?? '', members: r.members }))\n" + s.slice(b + "      return [...rows.map((r) => ({ member_id: r.member_id, staff_kind: r.artistic_functions?.name ?? '', members: r.members })), ...regRows]\n".length)
  s = rep(s, ", { key: 'Regência', label: 'Regência' }", "")
  s = rep(s, "<Button size=\"icon\" variant=\"outline\" aria-label=\"Cancelar\" title=\"Cancelar\" onClick={onDone}><X className=\"h-4 w-4\" /></Button>", "<Button size=\"icon\" variant=\"outline\" aria-label=\"Cancelar\" title=\"Cancelar\" onClick={onDone}><X className=\"h-4 w-4\" /></Button>")
  s = rep(s, "<Button className=\"w-full\" variant=\"outline\" aria-label=\"Cancelar\" title=\"Cancelar\" onClick={onDone}><X className=\"h-4 w-4\" /></Button>", "<Button className=\"w-full\" variant=\"outline\" aria-label=\"Cancelar\" title=\"Cancelar\" onClick={onDone}><X className=\"h-4 w-4\" /> Cancelar</Button>")
  return s
})

// Naipes: regente não é remunerado (sem escolha)
edit('src/modules/structure/NaipesPage.tsx', s => {
  s = rep(s, "      const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: v.member, staff_kind: v.kind, [col]: id, compensation: comp, cycle_id: cycleId })", "      const { error } = await supabase.from('staff_assignments').insert({ organization_id: orgId, member_id: v.member, staff_kind: v.kind, [col]: id, compensation: v.kind === 'regente' ? 'collaborative' : comp, cycle_id: cycleId })")
  s = rep(s, "          <CompensationPick value={comp} onChange={setComp} />\n          {comp ? <MemberPicker", "          {adding !== 'regente' && <CompensationPick value={comp} onChange={setComp} />}\n          {(comp || adding === 'regente') ? <MemberPicker")
  return s
})
