-- Loja · pedidos: criar (preço e estoque conferidos NO SERVIDOR), cancelar/expirar, avisar pagamento, limite de tentativas.
-- Estoque: `stock` = unidades físicas; `reserved` = unidades já vendidas e ainda não retiradas. Disponível = stock − reserved.
--   • criar pedido      → reserved += qtd   • cancelar/expirar → reserved −= qtd (se ainda não retirado)
--   • retirar (etapa 6) → stock −= qtd e reserved −= qtd
-- As funções abaixo são chamadas só pelas Edge Functions (service role): nenhuma é executável por anon/authenticated.

create or replace function public.shop_normalize_phone(p_phone text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(d) in (10, 11) then d := '55' || d; end if;
  if d !~ '^55[0-9]{10,11}$' then raise exception 'Informe um telefone com DDD, por exemplo (21) 99999-8888.' using errcode = 'P0001'; end if;
  return d;
end $$;

create or replace function public.shop_new_order_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; hex text; candidate text; i int;
begin
  loop
    hex := replace(gen_random_uuid()::text, '-', '');
    candidate := '';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, (('x' || substr(hex, i * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.shop_orders o where o.code = candidate);
  end loop;
  return candidate;
end $$;

-- Janela deslizante de tentativas. Devolve false (e NÃO registra) quando o limite foi atingido.
create or replace function public.shop_rate_limit(p_bucket text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.shop_lookup_attempts where created_at < now() - interval '2 days';
  select count(*) into n from public.shop_lookup_attempts where bucket = p_bucket and created_at > now() - p_window;
  if n >= p_max then return false; end if;
  insert into public.shop_lookup_attempts (bucket) values (p_bucket);
  return true;
end $$;
revoke all on function public.shop_rate_limit(text, int, interval) from public, anon, authenticated;
revoke all on function public.shop_normalize_phone(text) from public, anon, authenticated;
revoke all on function public.shop_new_order_code() from public, anon, authenticated;

-- ───────────── criar pedido ─────────────
-- p_items: [{"variant_id": uuid, "quantity": int}]. Preço, desconto, estoque e membro são decididos AQUI, nunca pelo navegador.
create or replace function public.shop_create_order(
  p_org uuid, p_user uuid, p_name text, p_phone text, p_email text, p_pickup uuid, p_method text, p_items jsonb, p_hours int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.shop_normalize_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_member uuid; v_pp record; v_order uuid; v_code text;
  r record; v_unit int; v_pct numeric; v_sub int := 0; v_total int := 0; v_open int; v_kinds text[] := '{}';
  v_items jsonb := '[]'::jsonb;
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'Informe o seu nome.' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'Informe um e-mail válido.' using errcode = 'P0001'; end if;
  if p_method not in ('pix', 'infinitepay') then raise exception 'Método de pagamento inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'O carrinho está vazio ou grande demais.' using errcode = 'P0001';
  end if;

  select * into v_pp from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active;
  if not found then raise exception 'Escolha um ponto de retirada válido.' using errcode = 'P0001'; end if;

  -- evita acumular reservas: poucos pedidos em aberto por telefone/e-mail
  select count(*) into v_open from public.shop_orders
   where organization_id = p_org and status = 'awaiting_payment' and (customer_phone = v_phone or lower(customer_email) = v_email);
  if v_open >= 3 then raise exception 'Você já tem pedidos aguardando pagamento. Conclua ou aguarde o prazo deles antes de fazer outro.' using errcode = 'P0001'; end if;

  if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); end if;

  v_code := public.shop_new_order_code();
  insert into public.shop_orders (organization_id, code, customer_name, customer_phone, customer_email, member_id, pickup_point_id,
                                  payment_method, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_org, v_code, v_name, v_phone, v_email, v_member, p_pickup, p_method, 1, 0, 1, now() + make_interval(hours => p_hours))
  returning id into v_order;

  -- junta linhas repetidas e trava as variações em ordem fixa (sem deadlock entre pedidos simultâneos)
  for r in
    select x.variant_id, sum(x.quantity)::int as qty
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity int)
     group by x.variant_id order by x.variant_id
  loop
    declare v record;
    begin
      if r.qty is null or r.qty < 1 or r.qty > 20 then raise exception 'Quantidade inválida no carrinho.' using errcode = 'P0001'; end if;
      select v2.id as variant_id, v2.label, v2.stock, v2.reserved, p.id as product_id, p.name, p.kind, p.price_cents, p.member_discount_pct
        into v
        from public.shop_product_variants v2
        join public.shop_products p on p.id = v2.product_id and p.organization_id = v2.organization_id
       where v2.id = r.variant_id and v2.organization_id = p_org and v2.is_active and p.is_active
         for update of v2;
      if not found then raise exception 'Um item do carrinho não está mais à venda. Atualize o carrinho.' using errcode = 'P0001'; end if;

      if v.kind = 'stock' then
        if coalesce(v.stock, 0) - v.reserved < r.qty then
          raise exception 'Estoque insuficiente para % (%). Restam % unidade(s).', v.name, v.label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
        end if;
        update public.shop_product_variants set reserved = reserved + r.qty where id = v.variant_id;
      end if;

      v_pct := case when v_member is not null then v.member_discount_pct else 0 end;
      v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;
      if v_unit <= 0 then raise exception 'Preço inválido para %.', v.name using errcode = 'P0001'; end if;

      insert into public.shop_order_items (organization_id, order_id, product_id, variant_id, kind, product_name, variant_label,
                                           quantity, unit_price_cents, discount_pct, unit_final_cents)
      values (p_org, v_order, v.product_id, v.variant_id, v.kind, v.name, v.label, r.qty, v.price_cents, v_pct, v_unit);

      v_sub := v_sub + v.price_cents * r.qty;
      v_total := v_total + v_unit * r.qty;
      if not (v.kind = any (v_kinds)) then v_kinds := v_kinds || v.kind; end if;
      v_items := v_items || jsonb_build_object('name', v.name, 'variant', v.label, 'quantity', r.qty, 'unit_final_cents', v_unit, 'kind', v.kind);
    end;
  end loop;

  update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total where id = v_order;
  insert into public.shop_fulfillments (organization_id, order_id, kind) select p_org, v_order, unnest(v_kinds);
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
  values (p_org, v_order, 'order', null, 'awaiting_payment', 'cliente', case when v_member is not null then 'preço de integrante' end);

  return jsonb_build_object(
    'code', v_code, 'status', 'awaiting_payment', 'payment_method', p_method,
    'subtotal_cents', v_sub, 'discount_cents', v_sub - v_total, 'total_cents', v_total,
    'expires_at', (select expires_at from public.shop_orders where id = v_order), 'is_member_price', v_member is not null,
    'pickup', jsonb_build_object('name', v_pp.name, 'address', v_pp.address, 'opening_hours', v_pp.opening_hours),
    'items', v_items, 'kinds', to_jsonb(v_kinds));
end $$;
revoke all on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, int) from public, anon, authenticated;

-- ───────────── cancelar / expirar (libera as reservas ainda não retiradas) ─────────────
create or replace function public.shop_cancel_order(p_order uuid, p_reason text, p_actor_member uuid, p_actor_label text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o record; it record;
begin
  select * into o from public.shop_orders where id = p_order for update;
  if not found or o.status = 'cancelled' then return false; end if;
  for it in
    select i.variant_id, i.quantity from public.shop_order_items i
      join public.shop_fulfillments f on f.order_id = i.order_id and f.kind = i.kind
     where i.order_id = p_order and i.kind = 'stock' and f.status <> 'picked_up'
     order by i.variant_id
  loop
    update public.shop_product_variants set reserved = greatest(reserved - it.quantity, 0) where id = it.variant_id;
  end loop;
  update public.shop_orders set status = 'cancelled', cancel_reason = p_reason, expires_at = null where id = p_order;
  update public.shop_fulfillments set status = 'cancelled', updated_at = now() where order_id = p_order and status <> 'picked_up';
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_member_id, actor_label, note)
  values (o.organization_id, p_order, 'order', o.status, 'cancelled', p_actor_member, coalesce(p_actor_label, 'sistema'), p_reason);
  return true;
end $$;
revoke all on function public.shop_cancel_order(uuid, text, uuid, text) from public, anon, authenticated;

-- Cancela pedidos "aguardando pagamento" vencidos. "Em conferência" NÃO expira.
create or replace function public.shop_expire_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.shop_orders where status = 'awaiting_payment' and expires_at < now() order by expires_at limit 200 loop
    if public.shop_cancel_order(r.id, 'Prazo para pagamento expirado', null, 'sistema') then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.shop_expire_orders() from public, anon, authenticated;

-- ───────────── cliente avisa que pagou (Pix) → "pagamento em conferência" ─────────────
create or replace function public.shop_report_payment(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; v_phone text;
begin
  begin v_phone := public.shop_normalize_phone(p_phone);
  exception when others then return jsonb_build_object('ok', false, 'reason', 'not_found'); end;
  select * into o from public.shop_orders where code = upper(trim(p_code)) and customer_phone = v_phone for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status = 'awaiting_payment' then
    update public.shop_orders set status = 'payment_review', expires_at = null where id = o.id;
    insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
    values (o.organization_id, o.id, 'order', 'awaiting_payment', 'payment_review', 'cliente', 'cliente avisou que pagou');
    return jsonb_build_object('ok', true, 'status', 'payment_review');
  end if;
  return jsonb_build_object('ok', true, 'status', o.status);
end $$;
revoke all on function public.shop_report_payment(text, text) from public, anon, authenticated;

-- Só o service role (Edge Functions) executa as funções da loja.
grant execute on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, int) to service_role;
grant execute on function public.shop_report_payment(text, text) to service_role;
grant execute on function public.shop_rate_limit(text, int, interval) to service_role;
grant execute on function public.shop_cancel_order(uuid, text, uuid, text) to service_role;

-- Resolve o slug da loja (o service role não lê a tabela organizations diretamente).
create or replace function public.shop_org_id(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $
  select id from public.organizations where slug = p_slug and is_active
$;
revoke all on function public.shop_org_id(text) from public, anon, authenticated;
grant execute on function public.shop_org_id(text) to service_role;

-- ───────────── expiração automática a cada 15 minutos ─────────────
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'shop-expire-orders') then perform cron.unschedule('shop-expire-orders'); end if;
  perform cron.schedule('shop-expire-orders', '*/15 * * * *', 'select public.shop_expire_orders()');
end $$;
