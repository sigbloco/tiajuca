-- Loja · cupons no checkout. O cupom NÃO acumula com preço de integrante/especial: em cada item vale o MENOR preço final.
-- O servidor valida o código (ativo), aplica por item e grava no pedido (código, %, valor descontado pelo cupom).

alter table public.shop_orders
  add column if not exists coupon_code text,
  add column if not exists coupon_pct numeric(5,2),
  add column if not exists coupon_discount_cents integer not null default 0;

-- Consulta pública do cupom (vitrine): devolve o % se o código existe e está ativo, senão nulo. Com limite de tentativas por loja.
create or replace function public.shop_coupon_check(p_slug text, p_code text) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_pct numeric;
begin
  select id into v_org from public.organizations where slug = p_slug and is_active;
  if v_org is null then return null; end if;
  if not public.shop_rate_limit('coupon|' || p_slug, 120, interval '10 minutes') then return null; end if;
  select c.discount_pct into v_pct from public.shop_coupons c
   where c.organization_id = v_org and c.code = upper(trim(coalesce(p_code, ''))) and c.is_active;
  return v_pct;
end $$;
revoke all on function public.shop_coupon_check(text, text) from public;
grant execute on function public.shop_coupon_check(text, text) to anon, authenticated;

-- shop_create_order ganha p_coupon (último parâmetro, opcional).
do $m$
declare d text; n text;
begin
  select pg_get_functiondef('public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer)'::regprocedure) into d;
  n := d;
  n := replace(n, $r$p_items jsonb, p_hours integer)$r$, $r$p_items jsonb, p_hours integer, p_coupon text DEFAULT NULL::text)$r$);
  n := replace(n, $r$v_items jsonb := '[]'::jsonb;$r$, $r$v_items jsonb := '[]'::jsonb; v_coupon public.shop_coupons; v_coupon_off int := 0; v_unit2 int;$r$);
  n := replace(n, $r$v_special := public.shop_is_special(p_org, p_user); end if;$r$,
    $r$v_special := public.shop_is_special(p_org, p_user); end if;
  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    select * into v_coupon from public.shop_coupons where organization_id = p_org and code = upper(trim(p_coupon)) and is_active;
    if v_coupon.id is null then raise exception 'Cupom inválido ou desativado.' using errcode = 'P0001'; end if;
  end if;$r$);
  n := replace(n, $r$v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;$r$, $r$v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
      end if;
      if v_coupon.id is not null then
        v_unit2 := round(v.price_cents * (100 - v_coupon.discount_pct) / 100.0)::int;
        if v_unit2 > 0 and v_unit2 < v_unit then
          v_coupon_off := v_coupon_off + (v_unit - v_unit2) * r.qty;
          v_unit := v_unit2;
          v_pct := round((v.price_cents - v_unit) * 100.0 / v.price_cents, 2);
        end if;
      end if;$r$);
  n := replace(n, $r$update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total where id = v_order;$r$,
    $r$update public.shop_orders set subtotal_cents = v_sub, discount_cents = v_sub - v_total, total_cents = v_total,
         coupon_code = case when v_coupon_off > 0 then v_coupon.code end, coupon_pct = case when v_coupon_off > 0 then v_coupon.discount_pct end, coupon_discount_cents = v_coupon_off
   where id = v_order;$r$);
  n := replace(n, $r$'discount_cents', v_sub - v_total, 'total_cents', v_total,$r$, $r$'discount_cents', v_sub - v_total, 'total_cents', v_total,
    'coupon_code', case when v_coupon_off > 0 then v_coupon.code end, 'coupon_discount_cents', v_coupon_off,$r$);
  if n = d or position('p_coupon' in n) = 0 or position('v_coupon_off + ' in n) = 0 or position('coupon_discount_cents = v_coupon_off' in n) = 0 or position('''coupon_code'', case' in n) = 0 or position('Cupom inválido' in n) = 0 or position('v_unit2' in n) = 0 then
    raise exception 'shop_create_order: trecho esperado não encontrado';
  end if;
  drop function public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer);
  execute n;
  revoke all on function public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer,text) from public, anon, authenticated;
  grant execute on function public.shop_create_order(uuid,uuid,text,text,text,uuid,text,jsonb,integer,text) to service_role;
end $m$;

-- Consulta de pedidos e e-mails passam a saber do cupom.
do $m$
declare d text; n text;
begin
  select pg_get_functiondef('public.shop_order_view(uuid)'::regprocedure) into d;
  n := replace(d, $r$'subtotal_cents', r.subtotal_cents, 'discount_cents', r.discount_cents,$r$, $r$'subtotal_cents', r.subtotal_cents, 'discount_cents', r.discount_cents, 'coupon_code', r.coupon_code, 'coupon_discount_cents', r.coupon_discount_cents,$r$);
  if n = d then raise exception 'shop_order_view: trecho esperado não encontrado'; end if;
  execute n;
  select pg_get_functiondef('public.shop_mail_claim(integer)'::regprocedure) into d;
  n := replace(d, $r$'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents,$r$, $r$'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents, 'coupon_code', o.coupon_code, 'coupon_discount_cents', o.coupon_discount_cents,$r$);
  if n = d then raise exception 'shop_mail_claim: trecho esperado não encontrado'; end if;
  execute n;
end $m$;
