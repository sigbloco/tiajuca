-- Álbuns: vários autores ("mídias por @a e @b"), cada um com a rede e o usuário.
alter table public.site_albums add column if not exists authors jsonb not null default '[]'::jsonb
  check (jsonb_typeof(authors) = 'array' and jsonb_array_length(authors) <= 10);
alter table public.site_albums drop column if exists author_kind, drop column if exists author_value;

create or replace function public.get_public_albums(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'logo_path', o.logo_path, 'theme', o.theme),
    'label', coalesce(s.albums_label, 'Fotos'),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'url', a.url, 'title', a.title, 'event_date', a.event_date,
                                          'authors', a.authors, 'cover_url', a.cover_url)
                       order by a.sort_order, a.event_date desc nulls last)
        from public.site_albums a where a.organization_id = o.id and a.is_active), '[]'::jsonb)
  )
  from public.organizations o
  left join public.site_settings s on s.organization_id = o.id
  where o.slug = p_slug and o.is_active
$$;
revoke all on function public.get_public_albums(text) from public;
grant execute on function public.get_public_albums(text) to anon, authenticated;
