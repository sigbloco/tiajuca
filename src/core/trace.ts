/** Diagnóstico temporário: guarda no aparelho os últimos passos do carregamento (para achar tela em branco após o login). */
const KEY = 'sigbloco:trace'
let last = ''
export function trace(msg: string) {
  if (msg === last) return
  last = msg
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { t: string; m: string }[]
    arr.push({ t: new Date().toISOString().slice(11, 23), m: msg })
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-60)))
  } catch { /* sem armazenamento */ }
}

export function startTrace() {
  trace(`boot ${location.pathname}${location.search}${location.hash ? ' #hash' : ''}`)
  window.addEventListener('error', (e) => trace(`error ${e.message}`))
  window.addEventListener('unhandledrejection', (e) => trace(`rejection ${(e.reason as Error)?.message ?? String(e.reason)}`))
  for (const ms of [800, 2500, 6000]) {
    setTimeout(() => {
      const root = document.getElementById('root')
      trace(`+${ms}ms ${location.pathname} texto=${root?.innerText.trim().length ?? -1} nós=${root?.querySelectorAll('*').length ?? -1}`)
    }, ms)
  }
}
