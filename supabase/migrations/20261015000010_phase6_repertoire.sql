-- SIGBloco · Fase 6 · Repertório, músicas e anexos/partituras (URL manual ou Supabase Storage privado).
-- Nada de colunas fixas por instrumento: anexos ligam música ↔ instrumento/naipe (novos instrumentos não mudam o schema).
-- Google Drive: preparado por `source`/`external_ref` e pela tabela `integrations` (sem dependência crítica de conta pessoal).

create table public.repertoires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  description text,
  color text not null default 'primary' check (color in ('primary','secondary','info','success','warning','muted')),
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create trigger trg_repertoires_updated before update on public.repertoires for each row execute function public.set_updated_at();

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, repertoire_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  artist text, genre text, musical_key text, notes text,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, repertoire_id) references public.repertoires (organization_id, id)
);
create index songs_repertoire_idx on public.songs (repertoire_id, sort_order);
create trigger trg_songs_updated before update on public.songs for each row execute function public.set_updated_at();

create table public.song_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, song_id uuid not null,
  instrument_id uuid, section_id uuid,
  kind text not null default 'score' check (kind in ('score', 'audio', 'video', 'lyrics', 'other')),
  url text,
  storage_path text, file_name text, mime_type text, size_bytes bigint,
  description text,
  source text not null default 'manual' check (source in ('manual', 'storage', 'gdrive')),
  external_ref text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  foreign key (organization_id, song_id) references public.songs (organization_id, id),
  foreign key (organization_id, instrument_id) references public.instruments (organization_id, id),
  foreign key (organization_id, section_id) references public.sections (organization_id, id),
  check (url is not null or storage_path is not null),
  check (url is null or url ~* '^https?://'),
  check (storage_path is null or storage_path like organization_id::text || '/%') -- arquivos sempre dentro da pasta da organização
);
create index song_attachments_song_idx on public.song_attachments (song_id) where is_active;

-- Integrações futuras (ex.: Google Drive institucional). Segredos NÃO ficam aqui: apenas referência (Vault/Edge Function).
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  provider text not null, config jsonb not null default '{}'::jsonb, credentials_ref text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, provider)
);

-- ───────────── Storage privado por organização ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-files', 'org-files', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_org(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.storage_org(text) to authenticated;

create policy org_files_select on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.is_org_member(public.storage_org(name)));
create policy org_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.has_permission(public.storage_org(name), 'repertoire.manage'));
create policy org_files_update on storage.objects for update to authenticated
  using (bucket_id = 'org-files' and public.has_permission(public.storage_org(name), 'repertoire.manage'))
  with check (bucket_id = 'org-files' and public.has_permission(public.storage_org(name), 'repertoire.manage'));
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and public.has_permission(public.storage_org(name), 'repertoire.manage'));

-- ───────────── auditoria, RLS e grants ─────────────
do $$
declare t text;
begin
  foreach t in array array['repertoires', 'songs', 'song_attachments', 'integrations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger trg_audit_%1$s after insert or update on public.%1$I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- leitura: quem tem repertoire.read (todos os papéis); itens inativos só para quem gerencia. Escrita: repertoire.manage.
create policy rep_select on public.repertoires for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'repertoire.read') is not null
         and (is_active or public.has_permission(organization_id, 'repertoire.manage')));
create policy rep_insert on public.repertoires for insert to authenticated with check (public.has_permission(organization_id, 'repertoire.manage'));
create policy rep_update on public.repertoires for update to authenticated
  using (public.has_permission(organization_id, 'repertoire.manage')) with check (public.has_permission(organization_id, 'repertoire.manage'));

create policy song_select on public.songs for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'repertoire.read') is not null
         and (is_active or public.has_permission(organization_id, 'repertoire.manage')));
create policy song_insert on public.songs for insert to authenticated with check (public.has_permission(organization_id, 'repertoire.manage'));
create policy song_update on public.songs for update to authenticated
  using (public.has_permission(organization_id, 'repertoire.manage')) with check (public.has_permission(organization_id, 'repertoire.manage'));

create policy att_select on public.song_attachments for select to authenticated
  using (public.is_org_member(organization_id) and public.permission_scope_of(organization_id, 'repertoire.read') is not null
         and (is_active or public.has_permission(organization_id, 'repertoire.manage')));
create policy att_insert on public.song_attachments for insert to authenticated with check (public.has_permission(organization_id, 'repertoire.manage'));
create policy att_update on public.song_attachments for update to authenticated
  using (public.has_permission(organization_id, 'repertoire.manage')) with check (public.has_permission(organization_id, 'repertoire.manage'));

create policy integ_select on public.integrations for select to authenticated using (public.has_permission(organization_id, 'settings.manage'));
create policy integ_insert on public.integrations for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy integ_update on public.integrations for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));
