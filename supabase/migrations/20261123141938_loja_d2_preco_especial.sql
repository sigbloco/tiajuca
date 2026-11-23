-- Etapa 7, D2 (LOJA-11): quem tem direito ao preço especial (direção, professores, monitores) paga o menor entre o
-- preço especial e o preço que já pagaria (de integrante, se ativo, ou o público). Antes o especial substituía o de
-- integrante mesmo quando era maior. Função inteira (igual à da etapa 4, só o bloco do especial mudou).

create or replace function public.shop_create_order(p_org uuid, p_user uuid, p_name text, p_phone text, p_email text, p_pickup uuid, p_method text, p_items jsonb, p_hours integer, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.shop_normalize_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_member uuid; v_special boolean := false; v_pp record; v_order uuid; v_code text;
  r record; v_unit int; v_pct numeric; v_sub int := 0; v_total int := 0; v_open int; v_kinds text[] := '{}';
  v_items jsonb := '[]'::jsonb; v_coupon public.shop_coupons; v_coupon_off int := 0; v_unit2 int;
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'Informe o seu nome.' using errcode = 'P0001'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'Informe um e-mail válido.' using errcode = 'P0001'; end if;
  if p_method not in ('pix', 'infinitepay') then raise exception 'Método de pagamento inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'O carrinho está vazio ou grande demais.' using errcode = 'P0001';
  end if;

  select * into v_pp from public.shop_pickup_points where id = p_pickup and organization_id = p_org and is_active and public.shop_schedule_has_future(schedule);
  if not found then raise exception 'Escolha um ponto de retirada válido.' using errcode = 'P0001'; end if;

  select count(*) into v_open from public.shop_orders
   where organization_id = p_org and status = 'awaiting_payment' and (customer_phone = v_phone or lower(customer_email) = v_email);
  if v_open >= 3 then raise exception 'Você já tem pedidos aguardando pagamento. Conclua ou aguarde o prazo deles antes de fazer outro.' using errcode = 'P0001'; end if;

  if p_user is not null then v_member := public.shop_active_member_id(p_org, p_user); v_special := public.shop_is_special(p_org, p_user); end if;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    select * into v_coupon from public.shop_coupons where organization_id = p_org and code = upper(trim(p_coupon)) and is_active for update;
    if v_coupon.id is null then raise exception 'Cupom inválido ou desativado.' using errcode = 'P0001'; end if;
    if v_coupon.valid_until is not null and v_coupon.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O cupom % passou da validade. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
    if v_coupon.max_uses is not null and public.shop_coupon_uses(p_org, v_coupon.code) >= v_coupon.max_uses then
      raise exception 'O cupom % já foi usado o número máximo de vezes. Tire o cupom para continuar.', v_coupon.code using errcode = 'P0001';
    end if;
  end if;

  v_code := public.shop_new_order_code();
  insert into public.shop_orders (organization_id, code, customer_name, customer_phone, customer_email, member_id, pickup_point_id,
                                  payment_method, subtotal_cents, discount_cents, total_cents, expires_at)
  values (p_org, v_code, v_name, v_phone, v_email, v_member, p_pickup, p_method, 1, 0, 1, now() + make_interval(hours => p_hours))
  returning id into v_order;

  for r in
    select x.variant_id, sum(x.quantity)::int as qty
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity int)
     group by x.variant_id order by x.variant_id
  loop
    declare v record;
    begin
      if r.qty is null or r.qty < 1 or r.qty > 20 then raise exception 'Quantidade inválida no carrinho.' using errcode = 'P0001'; end if;
      select v2.id as variant_id, v2.label, v2.stock, v2.reserved, p.id as product_id, p.name, p.kind, p.price_cents, p.member_discount_pct, p.special_price_cents
        into v
        from public.shop_product_variants v2
        join public.shop_products p on p.id = v2.product_id and p.organization_id = v2.organization_id
       where v2.id = r.variant_id and v2.organization_id = p_org and v2.is_active and p.is_active and not p.is_hidden
         for update of v2;
      if not found then raise exception 'Um item do carrinho não está mais à venda. Atualize o carrinho.' using errcode = 'P0001'; end if;
      if exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id)
         and not exists (select 1 from public.shop_product_pickups pk where pk.product_id = v.product_id and pk.pickup_point_id = p_pickup) then
        raise exception '% não pode ser retirado no ponto escolhido. Escolha outro ponto de retirada.', v.name using errcode = 'P0001';
      end if;

      if v.kind = 'stock' then
        if coalesce(v.stock, 0) - v.reserved < r.qty then
          raise exception 'Estoque insuficiente para % (%). Restam % unidade(s).', v.name, v.label, greatest(coalesce(v.stock, 0) - v.reserved, 0) using errcode = 'P0001';
        end if;
        update public.shop_product_variants set reserved = reserved + r.qty where id = v.variant_id;
      end if;

      v_pct := case when v_member is not null then v.member_discount_pct else 0 end;
      v_unit := round(v.price_cents * (100 - v_pct) / 100.0)::int;
      -- D2 (LOJA-11): o preço especial só vale quando é menor que o preço que a pessoa já pagaria (integrante ou público).
      if v_special and v.special_price_cents is not null and v.special_price_cents < v_unit then
        v_unit := v.special_price_cents;
        v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;
      if v_coupon.id is not null then
        v_unit2 := round(v.price_cents * (100 - v_coupon.discount_pct) / 100.0)::int;
        if v_unit2 > 0 and v_unit2 < v_unit then
          v_coupon_off := v_coupon_off + (v_unit - v_unit2) * r.qty;
          v_unit := v_unit2;
          v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
        end if;
      end if;
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

  update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total,
         coupon_code = case when v_coupon_off > 0 then v_coupon.code end, coupon_pct = case when v_coupon_off > 0 then v_coupon.discount_pct end, coupon_discount_cents = v_coupon_off
   where id = v_order;
  insert into public.shop_fulfillments (organization_id, order_id, kind) select p_org, v_order, unnest(v_kinds);
  insert into public.shop_order_events (organization_id, order_id, scope, from_status, to_status, actor_label, note)
  values (p_org, v_order, 'order', null, 'awaiting_payment', 'cliente', case when v_member is not null then 'preço de integrante' end);

  return jsonb_build_object(
    'code', v_code, 'status', 'awaiting_payment', 'payment_method', p_method,
    'subtotal_cents', v_sub, 'discount_cents', v_sub - v_total, 'total_cents', v_total,
    'coupon_code', case when v_coupon_off > 0 then v_coupon.code end, 'coupon_discount_cents', v_coupon_off,
    'expires_at', (select expires_at from public.shop_orders where id = v_order), 'is_member_price', v_member is not null,
    'pickup', jsonb_build_object('name', v_pp.name, 'address', v_pp.address, 'opening_hours', coalesce(public.shop_pickup_when(v_pp.schedule, v_pp.opening_hours), '')),
    'items', v_items, 'kinds', to_jsonb(v_kinds));
end $$;
revoke all on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.shop_create_order(uuid, uuid, text, text, text, uuid, text, jsonb, integer, text) to service_role;
