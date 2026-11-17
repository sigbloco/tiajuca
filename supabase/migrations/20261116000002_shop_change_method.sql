-- Loja · trocar a forma de pagamento de um pedido enquanto ele ainda está "aguardando pagamento".
-- A forma escolhida fica gravada no pedido (payment_method). Dono = conta logada (user_id/e-mail) OU código + telefone da compra.
-- Devolve os dados necessários para criar o link da InfinitePay quando o novo método for esse.
create or replace function public.shop_change_method(p_org uuid, p_user uuid, p_email text, p_code text, p_phone text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; v_phone text;
begin
  if p_method not in ('pix', 'infinitepay') then return jsonb_build_object('ok', false, 'reason', 'method'); end if;
  if p_user is not null then
    select * into o from public.shop_orders
     where organization_id = p_org and code = upper(trim(p_code))
       and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email))) for update;
  else
    begin v_phone := public.shop_normalize_phone(p_phone);
    exception when others then return jsonb_build_object('ok', false, 'reason', 'not_found'); end;
    select * into o from public.shop_orders where organization_id = p_org and code = upper(trim(p_code)) and customer_phone = v_phone for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status <> 'awaiting_payment' then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if o.payment_method <> p_method then
    update public.shop_orders set payment_method = p_method where id = o.id;
    insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
    values (o.organization_id, o.id, 'order', 'awaiting_payment', 'awaiting_payment', 'cliente', 'forma de pagamento: ' || o.payment_method || ' → ' || p_method);
  end if;
  return jsonb_build_object('ok', true, 'previous', o.payment_method,
    'order', jsonb_build_object('code', o.code, 'total_cents', o.total_cents, 'customer_name', o.customer_name, 'customer_email', o.customer_email,
      'customer_phone', o.customer_phone, 'payment_url', o.payment_ref ->> 'link_url',
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                  'unit_final_cents', i.unit_final_cents) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = o.id)));
end $$;
revoke all on function public.shop_change_method(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.shop_change_method(uuid, uuid, text, text, text, text) to service_role;
