-- Loja · "Meus pedidos": consulta por código + telefone (sem login). Devolve SÓ o pedido do próprio cliente e nada interno
-- (sem nomes de quem atendeu, sem referências de pagamento, sem dados de outros pedidos). Só o service role executa;
-- a Edge Function limita as tentativas por IP e por código.

create or replace function public.shop_order_lookup(p_code text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_phone text; r record;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false); end;

  select ord.*, pp.name as pp_name, pp.address as pp_address, pp.opening_hours as pp_hours into r
    from public.shop_orders ord join public.shop_pickup_points pp on pp.id = ord.pickup_point_id
   where ord.code = upper(trim(p_code)) and ord.customer_phone = v_phone;
  if not found then return jsonb_build_object('ok', false); end if;

  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'code', r.code, 'status', r.status, 'payment_method', r.payment_method, 'customer_name', r.customer_name,
      'subtotal_cents', r.subtotal_cents, 'discount_cents', r.discount_cents, 'total_cents', r.total_cents,
      'created_at', r.created_at, 'expires_at', r.expires_at, 'paid_at', r.paid_at,
      'payment_url', case when r.status = 'awaiting_payment' and r.payment_method = 'infinitepay' then r.payment_ref ->> 'link_url' end,
      'cancel_reason', case when r.status = 'cancelled' and r.cancel_reason is distinct from 'Falha ao iniciar o pagamento' then r.cancel_reason end),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_label, 'quantity', i.quantity,
                'unit_final_cents', i.unit_final_cents, 'kind', i.kind) order by i.created_at), '[]'::jsonb) from public.shop_order_items i where i.order_id = r.id),
    'fulfillments', (select coalesce(jsonb_agg(jsonb_build_object('kind', f.kind, 'status', f.status) order by f.kind), '[]'::jsonb) from public.shop_fulfillments f where f.order_id = r.id),
    'pickup', jsonb_build_object('name', r.pp_name, 'address', r.pp_address, 'opening_hours', r.pp_hours),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('scope', e.scope, 'status', e.to_status,
                  'kind', case when e.scope = 'fulfillment' then e.note end, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                   from public.shop_order_events e where e.order_id = r.id and e.from_status is distinct from e.to_status));
end $$;
revoke all on function public.shop_order_lookup(text, text) from public, anon, authenticated;
grant execute on function public.shop_order_lookup(text, text) to service_role;
