-- Álbuns de fotos (links públicos do Google Photos) mostrados numa página pública do site.
create table public.site_albums (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  url text not null check (url ~ '^https://(photos\.app\.goo\.gl|photos\.google\.com)/'),
  title text not null default '',
  event_date date,
  author_kind text not null default 'instagram' check (author_kind in ('whatsapp','email','instagram','youtube','facebook','tiktok','spotify','telefone','site')),
  author_value text,
  cover_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, url)
);
create trigger trg_site_albums_updated before update on public.site_albums for each row execute function public.set_updated_at();
create trigger trg_audit_site_albums after insert or update or delete on public.site_albums for each row execute function public.fn_audit();

alter table public.site_albums enable row level security;
revoke all on public.site_albums from anon, authenticated;
grant select, insert, update, delete on public.site_albums to authenticated;
create policy albums_select on public.site_albums for select to authenticated using (public.has_permission(organization_id, 'settings.manage'));
create policy albums_insert on public.site_albums for insert to authenticated with check (public.has_permission(organization_id, 'settings.manage'));
create policy albums_update on public.site_albums for update to authenticated using (public.has_permission(organization_id, 'settings.manage')) with check (public.has_permission(organization_id, 'settings.manage'));
create policy albums_delete on public.site_albums for delete to authenticated using (public.has_permission(organization_id, 'settings.manage'));

-- Botão "Fotos" no menu da página inicial (entra na ordem do menu).
alter table public.site_settings
  add column if not exists show_albums boolean not null default true,
  add column if not exists albums_label text not null default 'Fotos';
alter table public.site_settings drop constraint if exists site_settings_menu_order_check;
alter table public.site_settings add constraint site_settings_menu_order_check check (jsonb_typeof(menu_order) = 'array' and jsonb_array_length(menu_order) <= 4);
alter table public.site_settings drop constraint if exists site_settings_shake_button_check;
alter table public.site_settings add constraint site_settings_shake_button_check check (shake_button in ('enrollment', 'shop', 'login', 'albums'));

-- Leitura pública (página de fotos): só os álbuns ativos, na ordem escolhida.
create or replace function public.get_public_albums(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'logo_path', o.logo_path, 'theme', o.theme),
    'label', coalesce(s.albums_label, 'Fotos'),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'title', a.title, 'event_date', a.event_date,
                                          'author_kind', a.author_kind, 'author_value', a.author_value, 'cover_url', a.cover_url)
                       order by a.sort_order, a.event_date desc nulls last)
        from public.site_albums a where a.organization_id = o.id and a.is_active), '[]'::jsonb)
  )
  from public.organizations o
  left join public.site_settings s on s.organization_id = o.id
  where o.slug = p_slug and o.is_active
$$;
revoke all on function public.get_public_albums(text) from public;
grant execute on function public.get_public_albums(text) to anon, authenticated;
