-- Loja · vitrine pública. Uma chamada devolve a identidade do bloco e o catálogo ativo (sem login).
-- Não expõe estoque bruto nem reservas: só a quantidade DISPONÍVEL por variação (null = sob encomenda, sem controle).

create or replace function public.shop_get_public_store(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description, 'kind', p.kind,
        'price_cents', p.price_cents, 'member_discount_pct', p.member_discount_pct, 'lead_time_days', p.lead_time_days,
        'images', coalesce((select jsonb_agg(i.storage_path order by i.sort_order, i.created_at)
                              from public.shop_product_images i where i.product_id = p.id), '[]'::jsonb),
        'variants', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', v.id, 'label', v.label,
                        'available', case when p.kind = 'stock' then greatest(coalesce(v.stock, 0) - v.reserved, 0) end)
                      order by v.sort_order, v.label)
                    from public.shop_product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb)
      ) order by p.sort_order, p.name)
      from public.shop_products p where p.organization_id = o.id and p.is_active), '[]'::jsonb),
    'pickup_points', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'address', pp.address, 'opening_hours', pp.opening_hours)
                       order by pp.sort_order, pp.name)
      from public.shop_pickup_points pp where pp.organization_id = o.id and pp.is_active), '[]'::jsonb)
  )
  from public.organizations o where o.slug = p_slug and o.is_active
$$;
revoke all on function public.shop_get_public_store(text) from public;
grant execute on function public.shop_get_public_store(text) to anon, authenticated;
