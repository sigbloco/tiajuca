-- Início → Site: um produto da loja pode ser ligado ao botão "Loja" do menu (aparece a miniatura e o título; clicar abre o produto).
alter table public.site_settings add column if not exists shop_product_id uuid references public.shop_products(id) on delete set null;

create or replace function public.get_public_site(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'logo_path', o.logo_path, 'theme', o.theme),
    'site', coalesce(to_jsonb(s) - 'organization_id' - 'updated_at', '{}'::jsonb),
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
revoke all on function public.get_public_site(text) from public;
grant execute on function public.get_public_site(text) to anon, authenticated;
