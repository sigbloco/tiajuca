-- SIGBloco · Página inicial pública do bloco (estilo "link na bio"): foto, descrição, redes e contatos, menu (inscrições abertas,
-- loja, acesso dos integrantes) e vídeos do YouTube. Tudo editável pela Direção (settings.manage); o público só lê pela RPC.

create table public.site_settings (
  organization_id uuid primary key references public.organizations(id),
  headline text,
  description text,
  photo_url text check (photo_url is null or photo_url ~* '^(https://|/)'),
  -- [{ "kind": "whatsapp|email|instagram|youtube|facebook|tiktok|spotify|telefone|site", "label": "…", "value": "…" }]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20),
  -- [{ "url": "https://www.youtube.com/watch?v=…", "title": "…" }]
  videos jsonb not null default '[]'::jsonb check (jsonb_typeof(videos) = 'array' and jsonb_array_length(videos) <= 12),
  enrollment_label text not null default 'Inscrições da oficina',
  shop_label text not null default 'Loja',
  login_label text not null default 'Área dos integrantes',
  show_shop boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger trg_site_settings_updated before update on public.site_settings for each row execute function public.set_updated_at();
create trigger trg_audit_site_settings after insert or update on public.site_settings for each row execute function public.fn_audit();

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select, insert, update on public.site_settings to authenticated;
create policy site_select on public.site_settings for select to authenticated using (public.has_permission(organization_id, 'settings.manage'));
create policy site_insert on public.site_settings for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy site_update on public.site_settings for update to authenticated
  using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));

-- Leitura pública: só o que a página mostra (nada de dados pessoais). Inscrições "abertas" = publicadas e dentro da janela.
create or replace function public.get_public_site(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'site', coalesce(to_jsonb(s) - 'organization_id' - 'updated_at', '{}'::jsonb),
    'open_forms', coalesce((
      select jsonb_agg(jsonb_build_object('slug', f.slug, 'title', f.title) order by f.created_at)
        from public.forms f
       where f.organization_id = o.id and f.status = 'published'
         and (f.opens_at is null or f.opens_at <= now()) and (f.closes_at is null or f.closes_at >= now())), '[]'::jsonb)
  )
  from public.organizations o
  left join public.site_settings s on s.organization_id = o.id
  where o.slug = p_slug and o.is_active
$$;
revoke all on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;

-- Foto da página: bucket público de leitura; escrita só pela Direção, dentro da pasta da organização.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-public', 'site-public', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy site_public_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-public' and public.has_permission(public.storage_org(name), 'settings.manage'));
create policy site_public_update on storage.objects for update to authenticated
  using (bucket_id = 'site-public' and public.has_permission(public.storage_org(name), 'settings.manage'))
  with check (bucket_id = 'site-public' and public.has_permission(public.storage_org(name), 'settings.manage'));
create policy site_public_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-public' and public.has_permission(public.storage_org(name), 'settings.manage'));
