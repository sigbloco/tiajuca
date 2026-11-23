// Cloudflare Worker na frente do site: só para a página inicial ("/" e "/site"), troca o título e a descrição da pré-visualização do link
// (WhatsApp, Instagram etc. não executam JavaScript, então leem estas etiquetas direto do HTML) pelos do cadastro em Configurações → Site.
// Qualquer falha (banco fora do ar, demora, resposta estranha) devolve a página original sem mexer: o site nunca depende deste código.
// Todo o resto do site é servido direto pelos arquivos estáticos (ver run_worker_first em wrangler.jsonc).

// Os mesmos cabeçalhos de public/_headers: o arquivo não vale para respostas que saem do Worker.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://dzyvtqrxmladsxceqzud.supabase.co wss://dzyvtqrxmladsxceqzud.supabase.co; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
}

/** @param {Response} res */
function withSecurityHeaders(res) {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

/** @param {Request} request @param {{ ASSETS: { fetch: typeof fetch }, SUPABASE_URL: string, SUPABASE_KEY: string, ORG_SLUG: string }} env */
export default {
  async fetch(request, env) {
    return withSecurityHeaders(await render(request, env))
  },
}

/** @param {Request} request @param {{ ASSETS: { fetch: typeof fetch }, SUPABASE_URL: string, SUPABASE_KEY: string, ORG_SLUG: string }} env */
async function render(request, env) {
  const page = await env.ASSETS.fetch(request)
  if (request.method !== 'GET' || !(page.headers.get('content-type') ?? '').includes('text/html')) return page
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_public_site?p_slug=${encodeURIComponent(env.ORG_SLUG)}`
    const res = await fetch(url, { headers: { apikey: env.SUPABASE_KEY }, signal: AbortSignal.timeout(1500), cf: { cacheTtl: 60, cacheEverything: true } })
    if (!res.ok) return page
    const data = await res.json()
    const title = String(data?.site?.headline || data?.org?.name || '').trim().slice(0, 120)
    const description = String(data?.site?.description || '').trim().replace(/\s+/g, ' ').slice(0, 200)
    if (!title) return page
    const setContent = (value) => ({ element: (el) => el.setAttribute('content', value) })
    // SITE-09: a imagem da prévia acompanha o endereço em que o site está (o index.html guarda um endereço fixo de workers.dev).
    const image = `${new URL(request.url).origin}/brand/tiajuca-share.png`
    let rewriter = new HTMLRewriter()
      .on('title', { element: (el) => el.setInnerContent(title) })
      .on('meta[property="og:title"]', setContent(title))
      .on('meta[name="twitter:title"]', setContent(title))
      .on('meta[property="og:site_name"]', setContent(String(data?.org?.name || title)))
      .on('meta[property="og:image"]', setContent(image))
      .on('meta[name="twitter:image"]', setContent(image))
    if (description) {
      rewriter = rewriter
        .on('meta[name="description"]', setContent(description))
        .on('meta[property="og:description"]', setContent(description))
        .on('meta[name="twitter:description"]', setContent(description))
    }
    const out = rewriter.transform(page)
    const headers = new Headers(out.headers)
    headers.set('cache-control', 'public, max-age=60')
    return new Response(out.body, { status: out.status, headers })
  } catch {
    return page
  }
}
