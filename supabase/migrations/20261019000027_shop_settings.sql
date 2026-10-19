-- Loja · configurações editáveis no painel: métodos de pagamento habilitados, InfiniteTag e endereço público do site.
-- A InfiniteTag NÃO é uma senha (a integração da InfinitePay não usa token), mas só quem tem shop.manage lê/edita.
-- As Edge Functions leem estas configurações pelo banco (service role); nada de pagamento fica mais em variável de ambiente.

create table public.shop_settings (
  organization_id uuid primary key references public.organizations(id),
  payment_methods text[] not null default array['pix'],
  infinitepay_handle text check (infinitepay_handle is null or infinitepay_handle ~ '^[A-Za-z0-9_.-]{2,40}$'),
  public_site_url text check (public_site_url is null or public_site_url ~ '^https?://[^\s/]+[^\s]*[^\s/]$'),
  updated_at timestamptz not null default now(), updated_by uuid,
  check (cardinality(payment_methods) > 0 and payment_methods <@ array['pix', 'infinitepay']),
  check (not ('infinitepay' = any (payment_methods)) or (infinitepay_handle is not null and public_site_url is not null))
);
create trigger trg_shop_settings_updated before update on public.shop_settings for each row execute function public.set_updated_at();
create trigger trg_audit_shop_settings after insert or update on public.shop_settings for each row execute function public.fn_audit();

alter table public.shop_settings enable row level security;
revoke all on public.shop_settings from anon, authenticated;
grant select, insert, update on public.shop_settings to authenticated;
create policy shop_settings_sel on public.shop_settings for select to authenticated using (public.has_permission(organization_id, 'shop.manage'));
create policy shop_settings_ins on public.shop_settings for insert to authenticated with check (public.has_permission(organization_id, 'shop.manage'));
create policy shop_settings_upd on public.shop_settings for update to authenticated
  using (public.has_permission(organization_id, 'shop.manage')) with check (public.has_permission(organization_id, 'shop.manage'));

insert into public.shop_settings (organization_id) select id from public.organizations on conflict do nothing;

-- Para as Edge Functions (service role). Sem linha = só Pix.
create or replace function public.shop_get_settings(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('payment_methods', to_jsonb(payment_methods), 'infinitepay_handle', infinitepay_handle, 'public_site_url', public_site_url)
       from public.shop_settings where organization_id = p_org),
    jsonb_build_object('payment_methods', jsonb_build_array('pix'), 'infinitepay_handle', null, 'public_site_url', null))
$$;
revoke all on function public.shop_get_settings(uuid) from public, anon, authenticated;
grant execute on function public.shop_get_settings(uuid) to service_role;

-- Vitrine: devolve os métodos EFETIVAMENTE disponíveis (InfinitePay só aparece se a InfiniteTag estiver preenchida).
create or replace function public.shop_get_public_store(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'logo_path', o.logo_path, 'theme', o.theme),
    'payment_methods', coalesce((
      select to_jsonb(array_remove(array[
               case when 'pix' = any (s.payment_methods) then 'pix' end,
               case when 'infinitepay' = any (s.payment_methods) and s.infinitepay_handle is not null and s.public_site_url is not null then 'infinitepay' end], null))
        from public.shop_settings s where s.organization_id = o.id), '["pix"]'::jsonb),
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

-- O webhook precisa da InfiniteTag da organização do pedido.
create or replace function public.shop_order_for_payment(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'total_cents', o.total_cents, 'payment_method', o.payment_method,
                            'payment_ref', o.payment_ref, 'infinitepay_handle', s.infinitepay_handle)
    from public.shop_orders o left join public.shop_settings s on s.organization_id = o.organization_id
   where o.code = upper(trim(p_code))
$$;
