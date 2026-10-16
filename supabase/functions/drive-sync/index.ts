// Edge Function: compartilha uma pasta do Google Drive com os e-mails de quem tem acesso a ela no app.
//
// Segurança:
//  • Exige usuário logado (JWT) com permissão `drive.manage`: o contexto vem do RPC `drive_sync_context`, que checa isso.
//  • Quem deve ter acesso e a pasta vêm do BANCO; o navegador só informa QUAL pasta cadastrada sincronizar.
//  • A credencial é a CONTA DE SERVIÇO (segredo GOOGLE_SERVICE_ACCOUNT_JSON). Ela precisa ser EDITORA da pasta no Drive.
//  • Só adiciona/remove permissões de LEITOR criadas pelo próprio app. Donos e compartilhamentos manuais nunca são tocados.
//  • `mode: 'preview'` (padrão) apenas calcula; `mode: 'apply'` executa.
//
// POST JSON: { folder_id: <uuid da pasta cadastrada no app>, mode?: 'preview' | 'apply' }

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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

// Escopo de escrita no Drive (necessário para gerenciar permissões das pastas).
async function googleToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${b64url(sig)}` }),
  })
  if (!res.ok) throw new Error('Não foi possível autenticar no Google com a conta de serviço.')
  return (await res.json()).access_token as string
}

interface DrivePerm { id: string; emailAddress?: string; role: string; type: string }

async function listPermissions(token: string, folderId: string): Promise<{ ok: boolean; status: number; reason: string; perms: DrivePerm[] }> {
  const perms: DrivePerm[] = []
  let page = ''
  for (let i = 0; i < 20; i++) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('fields', 'nextPageToken,permissions(id,emailAddress,role,type)')
    url.searchParams.set('pageSize', '100')
    if (page) url.searchParams.set('pageToken', page)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { ok: false, status: res.status, reason: String(err?.error?.errors?.[0]?.reason ?? err?.error?.status ?? ''), perms }
    }
    const body = await res.json()
    perms.push(...(body.permissions ?? []))
    page = body.nextPageToken ?? ''
    if (!page) break
  }
  return { ok: true, status: 200, reason: '', perms }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json()
    const folderId = String(body.folder_id ?? '')
    const apply = body.mode === 'apply'
    if (!/^[0-9a-f-]{36}$/i.test(folderId)) return json({ error: 'Pasta inválida.' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: ctx, error: ctxErr } = await supabase.rpc('drive_sync_context', { p_folder: folderId })
    if (ctxErr) return json({ error: ctxErr.message || 'Você não tem permissão para sincronizar esta pasta.' }, ctxErr.code === '42501' ? 403 : 400)

    const sa = loadServiceAccount()
    if (!sa) return json({ error: 'A conta de serviço do Google ainda não foi cadastrada no servidor.', code: 'no_credentials' }, 503)
    const token = await googleToken(sa)
    const driveId: string = ctx.drive_folder_id

    const current = await listPermissions(token, driveId)
    if (!current.ok) {
      const hint = /accessNotConfigured|SERVICE_DISABLED/i.test(current.reason) || current.status === 403 && /api/i.test(current.reason)
        ? 'A Google Drive API não está ativada no projeto da conta de serviço (Google Cloud → APIs e serviços → Biblioteca → Google Drive API → Ativar).'
        : current.status === 404
          ? `A conta de serviço não enxerga esta pasta. Confira o link e compartilhe a pasta com ${sa.client_email} como Editor.`
          : `A conta de serviço não pode gerenciar esta pasta. Compartilhe com ${sa.client_email} como Editor (Leitor não basta).`
      return json({ error: `${hint} (Google: ${current.status} ${current.reason})`, code: 'no_folder_access', service_account: sa.client_email }, 409)
    }

    const targets: { member_id: string; email: string; name: string }[] = ctx.targets
    const shares: { email: string; permission_id: string | null }[] = ctx.shares
    const have = new Map(current.perms.filter((p) => p.type === 'user' && p.emailAddress).map((p) => [p.emailAddress!.toLowerCase(), p]))
    const want = new Set(targets.map((t) => t.email))
    const managed = new Map(shares.map((s) => [s.email, s]))

    // Adicionar: quem deve ter acesso e ainda não tem nenhuma permissão na pasta.
    const toAdd = targets.filter((t) => !have.has(t.email))
    // Remover: só o que o APP compartilhou antes e que não deve mais ter acesso (e ainda existe como leitor).
    const toRemove = [...managed.values()].filter((s) => !want.has(s.email) && have.get(s.email)?.role === 'reader')

    const preview = {
      folder_name: ctx.folder_name,
      service_account: sa.client_email,
      already_ok: targets.filter((t) => have.has(t.email)).length,
      add: toAdd.map((t) => ({ email: t.email, name: t.name })),
      remove: toRemove.map((s) => ({ email: s.email })),
    }
    if (!apply) return json({ mode: 'preview', ...preview })

    const added: { email: string; permission_id: string }[] = []
    const removed: string[] = []
    const failed: { email: string; name?: string; reason: string }[] = []

    for (const t of toAdd) {
      const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}/permissions`)
      url.searchParams.set('supportsAllDrives', 'true')
      url.searchParams.set('sendNotificationEmail', 'false') // não dispara e-mail do Google; quem não tem conta Google falha e é listado
      url.searchParams.set('fields', 'id')
      const res = await fetch(url, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: t.email }),
      })
      if (res.ok) added.push({ email: t.email, permission_id: (await res.json()).id })
      else {
        const msg = (await res.json().catch(() => ({})))?.error?.message ?? ''
        failed.push({ email: t.email, name: t.name, reason: /notification|google account/i.test(msg) ? 'Este e-mail não tem conta Google.' : 'O Google recusou o compartilhamento.' })
      }
    }
    for (const s of toRemove) {
      const permId = have.get(s.email)?.id ?? s.permission_id
      if (!permId) continue
      const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}/permissions/${encodeURIComponent(permId)}`)
      url.searchParams.set('supportsAllDrives', 'true')
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok || res.status === 404) removed.push(s.email)
      else failed.push({ email: s.email, reason: 'Não foi possível remover o acesso no Drive.' })
    }

    const summary = { added: added.length, removed: removed.length, failed: failed.length, already_ok: preview.already_ok, failed_list: failed }
    const { error: recErr } = await supabase.rpc('drive_sync_record', { p_folder: folderId, p_added: added, p_removed: removed, p_summary: summary })
    if (recErr) console.error('drive-sync record', recErr.message)
    return json({ mode: 'apply', ...preview, ...summary })
  } catch (e) {
    console.error('drive-sync', e instanceof Error ? e.message : e)
    return json({ error: 'Erro ao sincronizar com o Google Drive.' }, 500)
  }
})
