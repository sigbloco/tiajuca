// Edge Function: lê o link PÚBLICO de um álbum do Google Photos e devolve título e capa.
// Lê só as informações que a página pública publica para prévia de link (og:title / og:image).
// A capa é copiada para o armazenamento do site (bucket site-public), então não depende do endereço do Google.
//
// Segurança: exige usuário logado com permissão `settings.manage`; só abre endereços do Google Photos
// (e a imagem só de googleusercontent.com), para não servir de ponte para outros sites.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PAGE_HOSTS = ['photos.app.goo.gl', 'photos.google.com']
const okPage = (u: URL) => u.protocol === 'https:' && PAGE_HOSTS.includes(u.hostname)
const okImage = (u: URL) => u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(u.hostname)
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const unescapeHtml = (v: string) => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const meta = (html: string, prop: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')
  const m = html.match(re)
  return unescapeHtml((m?.[1] ?? m?.[2] ?? '').trim())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const body = await req.json()
    const orgId = String(body.organization_id ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: 'Organização inválida.' }, 400)
    let url: URL
    try { url = new URL(String(body.url ?? '').trim()) } catch { return json({ error: 'Cole o endereço completo do álbum.' }, 400) }
    if (!okPage(url)) return json({ error: 'Use o link de compartilhamento do Google Fotos (photos.app.goo.gl ou photos.google.com).' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: allowed } = await supabase.rpc('has_permission', { p_org: orgId, p_perm: 'settings.manage' })
    if (!allowed) return json({ error: 'Você não tem permissão para editar o site.' }, 403)

    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' } })
    if (!res.ok) return json({ error: 'Não foi possível abrir o link. Confira se o álbum está compartilhado.' }, 502)
    if (!okPage(new URL(res.url))) return json({ error: 'O link levou a um endereço não permitido.' }, 400)
    const html = (await res.text()).slice(0, 400_000)

    // O Google acrescenta " · datas 📸" ao título: fica só o nome do álbum.
    const title = meta(html, 'og:title').replace(/\s+-\s+Google (Fotos|Photos)$/i, '').split(' · ')[0].trim()
    const image = meta(html, 'og:image')
    let cover_url: string | null = null
    if (image) {
      try {
        if (okImage(new URL(image))) {
          const big = image.replace(/=[wh]\d[^/]*$/, '=w1200-h900-c')
          const img = await fetch(big, { headers: { 'User-Agent': UA } })
          const ct = img.headers.get('content-type') ?? ''
          if (img.ok && /^image\/(jpeg|png|webp)$/.test(ct)) {
            const bytes = new Uint8Array(await img.arrayBuffer())
            if (bytes.length > 0 && bytes.length <= 5 * 1024 * 1024) {
              const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
              const path = `${orgId}/album-${crypto.randomUUID()}.${ext}`
              const up = await supabase.storage.from('site-public').upload(path, bytes, { contentType: ct, upsert: false })
              if (!up.error) cover_url = supabase.storage.from('site-public').getPublicUrl(path).data.publicUrl
            }
          }
        }
      } catch { /* sem capa: o cartão sai só com o título */ }
    }
    return json({ title, cover_url, found: Boolean(title || cover_url) })
  } catch (e) {
    return json({ error: 'Não foi possível ler o álbum agora.', detail: String((e as Error)?.message ?? e) }, 500)
  }
})
