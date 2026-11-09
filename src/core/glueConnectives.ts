/**
 * Regra de texto do site todo: conectivos (de, da, e, em, para) nunca ficam sozinhos no fim da linha.
 * Cada conectivo é "colado" à palavra seguinte com espaço sem quebra, então "Caixa de guerra" quebra
 * como "Caixa / de guerra" e nunca "Caixa de / guerra".
 */
const NBSP = ' '
const CONNECTIVES = 'a|o|as|os|um|uma|de|da|do|das|dos|e|em|no|na|nos|nas|ao|aos|à|às|com|por|para|pra|ou|que|se|sem|sob|até'
// Espaço comum (não o NBSP) depois de um conectivo isolado.
const RE = new RegExp(`(^|[ \\t\\n(])(${CONNECTIVES})[ \\t\\n]+(?=\\S)`, 'gi')
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'])

function glue(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  for (const t of nodes) {
    const parent = t.parentElement
    if (!parent || SKIP.has(parent.tagName) || parent.isContentEditable) continue
    const v = t.nodeValue ?? ''
    if (!RE.test(v)) { RE.lastIndex = 0; continue }
    RE.lastIndex = 0
    // Aplica duas vezes: "de a" encadeado ("Caixa de a ...") fica colado por inteiro.
    const next = v.replace(RE, (_m, pre: string, w: string) => `${pre}${w}${NBSP}`).replace(RE, (_m, pre: string, w: string) => `${pre}${w}${NBSP}`)
    if (next !== v) t.nodeValue = next
  }
}

export function startGlueConnectives() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  let queued = false
  const pending = new Set<Node>()
  const flush = () => {
    queued = false
    for (const n of pending) if (n.isConnected) glue(n)
    pending.clear()
  }
  const schedule = (n: Node) => {
    pending.add(n.nodeType === Node.TEXT_NODE ? n.parentNode ?? n : n)
    if (!queued) { queued = true; requestAnimationFrame(flush) }
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') schedule(m.target)
      else m.addedNodes.forEach(schedule)
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true })
  schedule(document.body)
}
