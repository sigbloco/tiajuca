-- Loja: dados de contato da conta logada para preencher o checkout (telefone do cadastro de integrante, ou o do último pedido).
create or replace function public.shop_my_contact(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', m.full_name, 'email', m.email,
    'phone', coalesce(nullif(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), ''),
      (select regexp_replace(o.customer_phone, '^55', '') from public.shop_orders o where o.organization_id = p_org and o.user_id = auth.uid() order by o.created_at desc limit 1)))
  from (select 1) x left join public.members m on m.organization_id = p_org and m.user_id = auth.uid() and m.archived_at is null
$$;
revoke all on function public.shop_my_contact(uuid) from public, anon;
grant execute on function public.shop_my_contact(uuid) to authenticated;
