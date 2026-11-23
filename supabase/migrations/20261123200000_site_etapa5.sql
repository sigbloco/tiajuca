-- Etapa 5 da revisão: site.
-- SITE-02: get_public_site lista as colunas públicas uma a uma (antes devolvia a linha inteira de site_settings:
--          qualquer coluna nova viraria pública sozinha). header_color e page_color (legado, SITE-10) deixam de ser expostas.
-- SITE-03: checks que faltavam (logo do bloco, capa de álbum, cores dos raios).

create or replace function public.get_public_site(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'site', case when s.organization_id is null then '{}'::jsonb else jsonb_build_object(
      'headline', s.headline, 'description', s.description, 'photo_url', s.photo_url, 'links', s.links, 'videos', s.videos,
      'enrollment_label', s.enrollment_label, 'shop_label', s.shop_label, 'login_label', s.login_label, 'albums_label', s.albums_label, 'release_label', s.release_label,
      'show_shop', s.show_shop, 'show_enrollment', s.show_enrollment, 'show_login', s.show_login, 'show_albums', s.show_albums, 'show_release', s.show_release,
      'release_url', s.release_url, 'shake_button', s.shake_button, 'menu_order', s.menu_order, 'menu_construction', s.menu_construction,
      'hide_headline', s.hide_headline, 'shop_product_id', s.shop_product_id,
      'show_rays', s.show_rays, 'rays_count', s.rays_count, 'rays_opacity', s.rays_opacity, 'rays_rotation', s.rays_rotation, 'rays_color', s.rays_color,
      'rays_animate', s.rays_animate, 'rays_outline', s.rays_outline, 'rays_outline_color', s.rays_outline_color, 'rays_speed', s.rays_speed, 'rays_full', s.rays_full) end,
    'shop_product', (
      select jsonb_build_object('slug', p.slug, 'name', p.name,
        'image_path', (select i.storage_path from public.shop_product_images i where i.product_id = p.id order by i.sort_order, i.created_at limit 1))
        from public.shop_products p
       where p.id = s.shop_product_id and p.organization_id = o.id and p.is_active and not p.is_hidden),
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

alter table public.organizations add constraint organizations_logo_path_check check (logo_path is null or logo_path ~* '^(https://|/)');
alter table public.site_albums add constraint site_albums_cover_url_check check (cover_url is null or cover_url ~* '^https://');
alter table public.site_settings add constraint site_settings_rays_color_check check (rays_color is null or rays_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.site_settings add constraint site_settings_rays_outline_color_check check (rays_outline_color is null or rays_outline_color ~ '^#[0-9a-fA-F]{6}$');
