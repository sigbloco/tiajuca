-- Loja · pedidos ligados à conta (Meus pedidos sem código/telefone) e criação idempotente (sem pedido duplicado em novo clique/F5).
--   • user_id            → dono do pedido quando o comprador estava logado (qualquer conta, não só integrante).
--   • client_request_id  → UUID gerado pelo navegador por tentativa de compra; repetir a mesma tentativa devolve o MESMO pedido.
alter table public.shop_orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.shop_orders add column if not exists client_request_id uuid;
create index if not exists shop_orders_user_idx on public.shop_orders (organization_id, user_id, created_at desc) where user_id is not null;
create unique index if not exists shop_orders_request_uq on public.shop_orders (organization_id, client_request_id) where client_request_id is not null;

-- Grava dono e chave de idempotência. Devolve false se outra requisição já criou pedido com a mesma chave (corrida).
create or replace function public.shop_set_order_owner(p_code text, p_user uuid, p_request uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.shop_orders set user_id = p_user, client_request_id = p_request where code = p_code;
  return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.shop_set_order_owner(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.shop_set_order_owner(text, uuid, uuid) to service_role;

-- Pedido já criado por esta tentativa (se houver).
create or replace function public.shop_order_by_request(p_org uuid, p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.shop_orders where organization_id = p_org and client_request_id = p_request;
  if not found then return null; end if;
  return jsonb_build_object('code', r.code, 'status', r.status, 'payment_url', r.payment_ref ->> 'link_url');
end $$;
revoke all on function public.shop_order_by_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.shop_order_by_request(uuid, uuid) to service_role;

-- Visão completa de um pedido (a mesma de "Meus pedidos"), por id interno.
create or replace function public.shop_order_view(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select ord.*, pp.name as pp_name, pp.address as pp_address, pp.opening_hours as pp_hours into r
    from public.shop_orders ord join public.shop_pickup_points pp on pp.id = ord.pickup_point_id where ord.id = p_id;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'code', r.code, 'status', r.status, 'payment_method', r.payment_method, 'customer_name', r.customer_name,
      'pickup_point_id', r.pickup_point_id,
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
revoke all on function public.shop_order_view(uuid) from public, anon, authenticated;
grant execute on function public.shop_order_view(uuid) to service_role;

-- Pedidos da conta (mais novos primeiro), já com o detalhe. Compras feitas como visitante com o e-mail da conta também entram.
create or replace function public.shop_orders_of_user(p_org uuid, p_user uuid, p_email text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(public.shop_order_view(o.id) - 'ok' order by o.created_at desc), '[]'::jsonb) into v
    from (select id, created_at from public.shop_orders
           where organization_id = p_org and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email)))
           order by created_at desc limit 100) o;
  return v;
end $$;
revoke all on function public.shop_orders_of_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_orders_of_user(uuid, uuid, text) to service_role;

-- Id do pedido se ele pertence à conta (usado para avisar pagamento sem telefone).
create or replace function public.shop_order_owned(p_org uuid, p_user uuid, p_email text, p_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.shop_orders
   where organization_id = p_org and code = upper(trim(p_code))
     and (user_id = p_user or (user_id is null and p_email is not null and lower(customer_email) = lower(p_email)));
$$;
revoke all on function public.shop_order_owned(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.shop_order_owned(uuid, uuid, text, text) to service_role;

-- Consulta por código + telefone passa a usar a mesma visão.
create or replace function public.shop_order_lookup(p_code text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_phone text; v_id uuid;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false); end;
  select id into v_id from public.shop_orders where code = upper(trim(p_code)) and customer_phone = v_phone;
  if v_id is null then return jsonb_build_object('ok', false); end if;
  return public.shop_order_view(v_id);
end $$;
revoke all on function public.shop_order_lookup(text, text) from public, anon, authenticated;
grant execute on function public.shop_order_lookup(text, text) to service_role;

-- Cliente logado avisa que pagou (Pix) sem informar telefone: confere o dono e reaproveita shop_report_payment.
create or replace function public.shop_report_payment_owned(p_org uuid, p_user uuid, p_email text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_phone text;
begin
  v_id := public.shop_order_owned(p_org, p_user, p_email, p_code);
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select customer_phone into v_phone from public.shop_orders where id = v_id;
  return public.shop_report_payment(p_code, v_phone);
end $$;
revoke all on function public.shop_report_payment_owned(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.shop_report_payment_owned(uuid, uuid, text, text) to service_role;
