// Edge Function: busca partituras na pasta institucional do Google Drive.
//
// Segurança:
//  • Exige usuário logado (JWT verificado pelo gateway) e permissão `repertoire.manage` (RPC drive_integration_config).
//  • A pasta raiz vem do BANCO (nunca do cliente); subpastas só são aceitas se estiverem dentro da raiz.
//  • A credencial é uma CONTA DE SERVIÇO da organização, guardada como segredo GOOGLE_SERVICE_ACCOUNT_JSON.
//    Escopo somente-leitura. Nenhuma credencial é devolvida ao navegador.
//
// Ações (POST JSON): { organization_id, action: 'status' | 'list', q?, folder_id?, root_id?, folders_only? }
// `root_id` (opcional) escolhe uma das pastas cadastradas em Google Drive (drive_folders) como raiz da navegação; sem ele vale a pasta de partituras configurada.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FOLDER = 'application/vnd.google-apps.folder'
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const pemToDer = (pem: string) => {
  const raw = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer
}

interface ServiceAccount { client_email: string; private_key: string }
let cached: { token: string; exp: number } | null = null

function loadServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    return sa.client_email && sa.private_key ? sa : null
  } catch {
    return null
  }
}

async function googleToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${b64url(sig)}` }),
  })
  if (!res.ok) throw new Error('Não foi possível autenticar no Google com a conta de serviço.')
  const data = await res.json()
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600) }
  return cached.token
}

const drive = async (token: string, path: string, params: Record<string, string>) => {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`)
  Object.entries({ supportsAllDrives: 'true', ...params }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) }
}

// A subpasta pedida precisa estar DENTRO da pasta raiz configurada (até 8 níveis).
async function isInside(token: string, folderId: string, rootId: string): Promise<boolean> {
  let current = folderId
  for (let i = 0; i < 8; i++) {
    if (current === rootId) return true
    const r = await drive(token, `files/${encodeURIComponent(current)}`, { fields: 'parents' })
    const parent = r.body?.parents?.[0]
    if (!r.ok || !parent) return false
    current = parent
  }
  return current === rootId
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json()
    const orgId = String(body.organization_id ?? '')
    const action = String(body.action ?? 'list')
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: 'Organização inválida.' }, 400)

    // Quem chama precisa poder editar o repertório; a pasta raiz vem do banco.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: cfg, error: cfgErr } = await supabase.rpc('drive_integration_config', { p_org: orgId })
    if (cfgErr) return json({ error: 'Você não tem permissão para buscar no Drive.' }, 403)
    // Raízes permitidas: a pasta de partituras configurada e as pastas cadastradas (ativas) em Google Drive.
    const reqRoot = body.root_id ? String(body.root_id) : null
    const { data: regRows } = await supabase.from('drive_folders').select('drive_folder_id').eq('organization_id', orgId).eq('is_active', true)
    const registered = (regRows ?? []).map((r: { drive_folder_id: string | null }) => r.drive_folder_id).filter(Boolean) as string[]
    if (reqRoot) {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(reqRoot) || (!registered.includes(reqRoot) && reqRoot !== cfg?.folder_id)) return json({ error: 'Pasta raiz não permitida.' }, 403)
    } else {
      if (!cfg?.configured) return json({ error: 'A pasta do Google Drive ainda não foi configurada.', code: 'not_configured' }, 409)
      if (action === 'list' && !cfg.active) return json({ error: 'A integração com o Google Drive está desativada.', code: 'inactive' }, 409)
    }

    const sa = loadServiceAccount()
    if (!sa) return json({ error: 'A conta de serviço do Google ainda não foi cadastrada no servidor.', code: 'no_credentials' }, 503)
    const token = await googleToken(sa)
    const root: string = reqRoot ?? cfg.folder_id

    if (action === 'status') {
      const r = await drive(token, `files/${encodeURIComponent(root)}`, { fields: 'id,name,mimeType' })
      if (!r.ok) return json({ ok: false, service_account: sa.client_email, error: 'Sem acesso à pasta. Compartilhe a pasta com o e-mail da conta de serviço (leitor).' })
      return json({ ok: true, service_account: sa.client_email, folder_name: r.body.name })
    }

    const folder = body.folder_id ? String(body.folder_id) : root
    if (!/^[A-Za-z0-9_-]{10,}$/.test(folder)) return json({ error: 'Pasta inválida.' }, 400)
    if (folder !== root && !(await isInside(token, folder, root))) return json({ error: 'Pasta fora da área permitida.' }, 403)

    const qText = String(body.q ?? '').trim().slice(0, 80).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const q = [`'${folder}' in parents`, 'trashed = false', body.folders_only ? `mimeType = '${FOLDER}'` : null, qText ? `name contains '${qText}'` : null].filter(Boolean).join(' and ')
    const r = await drive(token, 'files', {
      q, pageSize: '100', orderBy: 'folder,name', includeItemsFromAllDrives: 'true',
      fields: 'files(id,name,mimeType,webViewLink,modifiedTime,size),nextPageToken',
      ...(body.page_token ? { pageToken: String(body.page_token) } : {}),
    })
    if (!r.ok) return json({ error: 'Não foi possível listar a pasta no Google Drive.' }, 502)
    const files = (r.body.files ?? []).map((f: Record<string, string>) => ({
      id: f.id, name: f.name, is_folder: f.mimeType === FOLDER, mime_type: f.mimeType, web_view_link: f.webViewLink ?? null, modified_at: f.modifiedTime ?? null,
    }))
    return json({ files, next_page_token: r.body.nextPageToken ?? null, folder_id: folder, root_id: root })
  } catch (e) {
    console.error('drive-search', e instanceof Error ? e.message : e)
    return json({ error: 'Erro ao consultar o Google Drive.' }, 500)
  }
})
